import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MCPServer, MCPAuthType, MCPAuthConfig, MCPTransportType } from "@/entities";
import { createLogger } from "@/utils/logger";
import { APP_USER_AGENT } from "@/config/application";
import { ok } from "@/utils/assert";

const logger = createLogger(__filename);

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

const CLIENTS_CACHE_TIMEOUT_MS = 90_000;
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

  private static readonly CLIENTS_CACHE: Map<string, MCPClient> = new Map();

  public static connect(server: MCPServer): MCPClient {
    if (MCPClient.CLIENTS_CACHE.has(server.id)) {
      logger.info({ url: server.url, transportType: server.transportType }, "Found connected MCP server");
      const client = MCPClient.CLIENTS_CACHE.get(server.id)!;
      return client.touch();
    }

    logger.info({ url: server.url, transportType: server.transportType }, "Connecting to MCP server");
    const client = new MCPClient(server);
    const close = async (client: MCPClient) =>
      MCPClient.closeClient(client).then(() => {
        MCPClient.CLIENTS_CACHE.delete(server.id);
      });
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
          return async (force: boolean = false) => {
            if (force) {
              return close(target);
            }
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

    MCPClient.CLIENTS_CACHE.set(server.id, proxy as MCPClient);
    return proxy;
  }

  private static async closeClient(client: MCPClient): Promise<void> {
    if (client.transport) {
      try {
        await client.close();
      } catch (e) {
        logger.warn(e, "Error closing MCP transport");
      }
      client.transport = undefined;
    }
  }

  private constructor(server: MCPServer) {
    this.server = server;
  }

  /**
   * Close the MCP client connection
   */
  async close(force: boolean = false): Promise<void> {
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
        if (this.transport instanceof StreamableHTTPClientTransport) {
          if (this.transport.sessionId) {
            await this.transport.terminateSession();
          }
        }
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

    if (authType === MCPAuthType.API_KEY && authConfig?.apiKey) {
      const headerName = authConfig.headerName || "X-API-Key";
      return { [headerName]: authConfig.apiKey };
    }

    if (authType === MCPAuthType.BEARER && authConfig?.bearerToken) {
      return { Authorization: `Bearer ${authConfig.bearerToken}` };
    }

    if (authType === MCPAuthType.OAUTH2 && authConfig?.bearerToken) {
      return { Authorization: `Bearer ${authConfig.bearerToken}` };
    }

    return {};
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
