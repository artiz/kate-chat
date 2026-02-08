import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MCPServer, MCPAuthType, MCPTransportType } from "@/entities";
import { createLogger } from "@/utils/logger";
import { APP_USER_AGENT } from "@/config/application";
import { ok } from "@/utils/assert";
import { MCPAuthToken } from "@/types/ai.types";
import { MCP_DEFAULT_API_KEY_HEADER } from "@/entities/MCPServer";

const logger = createLogger(__filename);

/**
 * Simple hash function for cache keys (not cryptographic)
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

export interface MCPToolAnnotations {
  title?: string | undefined;
  readOnlyHint?: boolean | undefined;
  destructiveHint?: boolean | undefined;
  idempotentHint?: boolean | undefined;
  openWorldHint?: boolean | undefined;
}

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  annotations?: MCPToolAnnotations;
  // icons
}

export interface MCPToolResult {
  content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | Record<string, any>)[];
  isError?: boolean;
}

const CLIENTS_CACHE_TIMEOUT_MS = 120_000;
const RECONNECT_TIMEOUT_MS = 500;
const RECONNECT_MAX_ATTEMPTS = 7;

/**
 * MCP Client wrapper using the official @modelcontextprotocol/sdk
 * Supports both:
 * - Streamable HTTP transport (2025-11-25 spec)
 * - Legacy HTTP+SSE transport (2024-11-05 spec) for backwards compatibility
 */
export class MCPClient {
  private server: MCPServer;
  private client: Client;
  private transport?: SSEClientTransport | StreamableHTTPClientTransport;
  private closeTimeout: NodeJS.Timeout;
  private authToken?: MCPAuthToken;

  private static readonly CLIENTS_CACHE: Map<string, MCPClient> = new Map();

  /**
   * Connect to an MCP server. For OAuth2 servers that require user authentication,
   * provide the authToken obtained from the client-side OAuth flow.
   */
  public static connect(server: MCPServer, authToken?: MCPAuthToken): MCPClient {
    // For OAuth servers with user tokens, include token hash in cache key to separate sessions per user
    const cacheKey = authToken ? `${server.id}:${simpleHash(authToken.accessToken)}` : server.id;

    if (MCPClient.CLIENTS_CACHE.has(cacheKey)) {
      logger.info(
        { url: server.url, transportType: server.transportType, hasAuth: !!authToken },
        "Found connected MCP server"
      );
      const client = MCPClient.CLIENTS_CACHE.get(cacheKey)!;
      return client.touch();
    }

    logger.info(
      { url: server.url, transportType: server.transportType, hasAuth: !!authToken },
      "Connecting to MCP server"
    );

    const client = new MCPClient(server, authToken);

    const close = async (client: MCPClient) => {
      logger.debug({ server: client.server.id }, "Closing MCP client connection");

      if (client.transport) {
        try {
          await client.transport.close();
          await client.client.close();
        } catch (e) {
          logger.warn(e, "Error closing MCP transport");
        }
        client.transport = undefined;
      }

      //t (e.g., client.client.close() and/or transport.terminateSession()/transport.close()) t

      MCPClient.CLIENTS_CACHE.delete(cacheKey);
    };

    const touch = (client: MCPClient): MCPClient => {
      clearTimeout(client.closeTimeout);
      client.closeTimeout = setTimeout(() => {
        close(client);
      }, CLIENTS_CACHE_TIMEOUT_MS);
      return client;
    };

    const fields = ["server", "client", "transport", "closeTimeout"];
    const proxy = new Proxy(client, {
      get(target, prop, receiver) {
        if (fields.includes(String(prop))) {
          return Reflect.get(target, prop, receiver);
        }

        if (prop === "touch") {
          return () => {
            touch(target);
            return receiver;
          };
        }

        if (prop === "close") {
          return async () => {
            touch(target);
          };
        }

        return async (...args: any[]) => {
          const result = Reflect.get(target, prop, receiver);
          if (typeof result !== "function") {
            return result;
          }

          let retryCount = 0;

          while (retryCount <= RECONNECT_MAX_ATTEMPTS) {
            try {
              await touch(target).init(retryCount > 0);
              return await result.apply(receiver, args);
            } catch (e: unknown) {
              if (e instanceof Error) {
                if (
                  e.message?.includes("Session not found") ||
                  e.message?.includes("Not connected") ||
                  e.message?.includes("fetch failed")
                ) {
                  if (retryCount < RECONNECT_MAX_ATTEMPTS) {
                    logger.warn({ retryCount }, "MCP connection lost, attempting to reconnect...");
                    retryCount++;
                    await new Promise(res => setTimeout(res, RECONNECT_TIMEOUT_MS * retryCount));
                    continue;
                  }
                }
              }

              logger.error(e, `Error calling MCP client method "${String(prop)}"`);
              throw e;
            }
          }
        };
      },
    });

    MCPClient.CLIENTS_CACHE.set(cacheKey, proxy as MCPClient);
    return proxy;
  }

  private constructor(server: MCPServer, oauthToken?: MCPAuthToken) {
    this.server = server;
    this.authToken = oauthToken;
  }

  /**
   * Close the MCP client connection
   */
  async close(): Promise<void> {
    // The actual transport close logic is handled in the proxy to ensure cache cleanup
  }

  touch(): MCPClient {
    return this;
  }

  /**
   * Connect to the MCP server using the configured transport type
   */
  async init(force: boolean = false): Promise<MCPClient> {
    if (this.transport && !force) return this;

    if (force && this.transport) {
      try {
        await this.transport.close();
        await this.client.close();
      } catch (e) {
        // eat error for now
        // logger.warn(e, "Error closing existing MCP transport during re-init");
      }
      this.transport = undefined;
    }

    this.client = new Client({
      name: APP_USER_AGENT,
      version: "1.0.0",
    });

    ok(this.server, "MCP server is required");
    const url = new URL(this.server.url);
    const headers = this.getCommonHeaders();

    const transportType = this.server.transportType || MCPTransportType.STREAMABLE_HTTP;

    if (transportType === MCPTransportType.HTTP_SSE_LEGACY) {
      // Legacy SSE transport
      this.transport = new SSEClientTransport(url, {
        requestInit: {
          headers,
        },
        eventSourceInit: {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              headers: {
                ...headers,
                ...(init?.headers || {}),
              },
            }),
        },
      });
    } else {
      // Streamable HTTP transport (default)
      this.transport = new StreamableHTTPClientTransport(url, {
        requestInit: {
          headers,
        },
      });
    }

    await this.client.connect(this.transport);
    return this;
  }

  /**
   * Initialize connection with the MCP server
   */
  async getInfo(): Promise<{ protocolVersion: string; capabilities: Record<string, any>; serverInfo: any }> {
    ok(this.transport);

    const serverInfo = this.client.getServerVersion();
    const capabilities = this.client.getServerCapabilities();

    return {
      protocolVersion: serverInfo?.version || "unknown",
      capabilities: capabilities || {},
      serverInfo: serverInfo || { name: "MCP Server" },
    };
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<MCPToolDefinition[]> {
    ok(this.transport);

    logger.debug(
      { serverId: this.server.id, session: (this.transport as StreamableHTTPClientTransport).sessionId },
      "Listing tools from MCP server"
    );

    const result = await this.client.listTools();
    if (!result || !result.tools) {
      return [];
    }

    return result.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, any>,
      outputSchema: tool.outputSchema as Record<string, any>,
      annotations: tool.annotations,
    }));
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(toolName: string, args: Record<string, any>): Promise<MCPToolResult> {
    ok(this.transport);

    const result = await this.client.callTool({
      name: toolName,
      arguments: args,
    });

    logger.debug({ toolName, serverId: this.server.id, result }, "Called MCP tool");

    return {
      content: Array.isArray(result?.content) ? result.content : [],
      isError: Boolean(result?.isError),
    };
  }

  /**
   * Get authorization headers based on auth type
   */
  private getAuthHeaders(): Record<string, string> {
    const { authConfig, authType } = this.server;

    if (!authType || authType === MCPAuthType.NONE) {
      return {};
    }

    if (authType === MCPAuthType.API_KEY) {
      const headerName = authConfig?.headerName || MCP_DEFAULT_API_KEY_HEADER;
      ok(this.authToken?.accessToken, "API key is required for API_KEY auth type");
      return { [headerName]: this.authToken.accessToken };
    }

    if (authType === MCPAuthType.BEARER) {
      ok(this.authToken?.accessToken, "Bearer token is required for BEARER auth type");
      return { Authorization: `Bearer ${this.authToken.accessToken}` };
    }

    if (authType === MCPAuthType.OAUTH2) {
      // For OAuth2, prefer user-provided token (for servers requiring user auth)
      // Fall back to server-configured bearer token (for client credentials flow)
      if (this.authToken?.accessToken) {
        ok(this.authToken?.accessToken, "Bearer token is required for OAUTH2 auth type");
        return { Authorization: `Bearer ${this.authToken.accessToken}` };
      }
    }

    return {};
  }

  /**
   * Check if the client has a valid OAuth token
   */
  public hasValidToken(): boolean {
    if (!this.authToken?.accessToken) {
      return false;
    }
    if (this.authToken.expiresAt && Date.now() >= this.authToken.expiresAt) {
      return false;
    }
    return true;
  }

  /**
   * Get OAuth configuration for the server (used by clients to initiate OAuth flow)
   */
  public getOAuthConfig(): {
    authorizationUrl?: string;
    clientId?: string;
    scope?: string;
  } | null {
    if (this.server.authType !== MCPAuthType.OAUTH2) {
      return null;
    }
    const authConfig = this.server.authConfig;
    return {
      authorizationUrl: authConfig?.authorizationUrl,
      clientId: authConfig?.clientId,
      scope: authConfig?.scope,
    };
  }

  /**
   * Get common headers for requests
   */
  private getCommonHeaders(): Record<string, string> {
    return {
      "User-Agent": APP_USER_AGENT,
      ...this.getAuthHeaders(),
    };
  }
}

/**
 * Helper to parse MCP tool name back to server and tool parts
 */
export function parseMCPToolName(toolName: string): { serverId: string; mcpToolName: string } | null {
  const match = toolName.match(/^mcp_(.+?)_(.+)$/);
  if (!match) {
    return null;
  }
  return {
    serverId: match[1],
    mcpToolName: match[2],
  };
}
