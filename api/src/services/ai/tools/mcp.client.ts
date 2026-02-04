import { Response, Agent, fetch } from "undici";
import { createParser, EventSourceMessage } from "eventsource-parser";
import crypto from "crypto";
import { MCPServer, MCPAuthType, MCPAuthConfig } from "@/entities";
import { createLogger } from "@/utils/logger";
import { APP_USER_AGENT } from "@/config/application";

const logger = createLogger(__filename);

const dispatcher = new Agent({
  connectTimeout: 30_000,
  bodyTimeout: 120_000,
  keepAliveTimeout: 60_000,
  connections: 50,
});

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}

export interface MCPToolResult {
  content: any[];
  isError?: boolean;
}

type TransportType = "streamable-http" | "http-sse-legacy";

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * MCP Client for communicating with Model Context Protocol servers
 * Implements both:
 * - Streamable HTTP transport (2025-11-25 spec)
 * - Legacy HTTP+SSE transport (2024-11-05 spec) for backwards compatibility
 * https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
 */
export class MCPClient {
  private server: MCPServer;
  private baseUrl: string;
  private postEndpoint?: string; // For legacy SSE transport, the endpoint received from SSE
  private sessionId?: string; // For session management
  private transportType?: TransportType;
  private isInitialized = false;

  // For legacy SSE transport - keep the connection open and track pending requests
  private sseReader?: ReadableStreamDefaultReader<Uint8Array>;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private sseStreamActive = false;

  constructor(server: MCPServer) {
    this.server = server;
    // Ensure URL doesn't end with slash
    this.baseUrl = server.url.replace(/\/$/, "");
  }

  /**
   * Get authorization headers based on auth type
   */
  private getAuthHeaders(): Record<string, string> {
    const authConfig = this.server.authConfig as MCPAuthConfig;
    const authType = this.server.authType;

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

    // OAuth2 would need token refresh logic - simplified here
    if (authType === MCPAuthType.OAUTH2 && authConfig?.bearerToken) {
      return { Authorization: `Bearer ${authConfig.bearerToken}` };
    }

    return {};
  }

  /**
   * Get common headers for requests
   */
  private getCommonHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": APP_USER_AGENT,
      ...this.getAuthHeaders(),
    };

    if (this.sessionId) {
      headers["MCP-Session-Id"] = this.sessionId;
    }

    return headers;
  }

  /**
   * Try to connect using the new Streamable HTTP transport first,
   * fall back to legacy HTTP+SSE if it fails with 400/404/405
   */
  private async detectTransportAndInitialize(): Promise<void> {
    if (this.isInitialized) return;

    const initRequest = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {
          tools: {},
        },
        clientInfo: {
          name: "KateChat",
          version: "1.0.0",
        },
      },
    };

    logger.debug({ url: this.baseUrl }, "Attempting Streamable HTTP transport");

    try {
      // Try POST first (new Streamable HTTP transport)
      const response = await fetch(this.baseUrl, {
        method: "POST",
        dispatcher,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...this.getCommonHeaders(),
        },
        body: JSON.stringify(initRequest),
      });

      if (response.ok) {
        // New Streamable HTTP transport works
        this.transportType = "streamable-http";
        logger.debug("Using Streamable HTTP transport");

        // Check for session ID
        const sessionId = response.headers.get("mcp-session-id");
        if (sessionId) {
          this.sessionId = sessionId;
          logger.debug({ sessionId }, "Received MCP session ID");
        }

        // Parse the response
        const result = await this.parseResponse(response);
        logger.debug({ result }, "Initialize response");

        // Send initialized notification
        await this.sendNotification("notifications/initialized");

        this.isInitialized = true;
        return;
      }

      // Check if we should fall back to legacy transport
      if ([400, 404, 405].includes(response.status)) {
        logger.debug({ status: response.status }, "Streamable HTTP failed, falling back to legacy HTTP+SSE transport");
        await this.initializeLegacyTransport();
        return;
      }

      // Other error
      const errorText = await response.text();
      throw new Error(`MCP server error (${response.status}): ${errorText}`);
    } catch (error: any) {
      // Network errors or other issues - try legacy transport
      if (error.code === "ECONNREFUSED" || error.message?.includes("fetch failed")) {
        throw error;
      }

      logger.debug({ error: error.message }, "Streamable HTTP failed, trying legacy transport");
      await this.initializeLegacyTransport();
    }
  }

  /**
   * Initialize using legacy HTTP+SSE transport (2024-11-05 spec)
   *
   * In legacy transport:
   * 1. Client opens SSE connection via GET - keeps it open
   * 2. Server sends 'endpoint' event with POST URL
   * 3. Client POSTs JSON-RPC requests to that endpoint
   * 4. Server responds via the SSE stream (POST returns 202 Accepted)
   */
  private async initializeLegacyTransport(): Promise<void> {
    this.transportType = "http-sse-legacy";
    logger.debug({ url: this.baseUrl }, "Connecting via legacy HTTP+SSE transport");

    // Establish SSE connection and get the endpoint
    // This also starts the background reader for responses
    await this.establishLegacySSEConnection();

    logger.debug({ endpoint: this.postEndpoint }, "Legacy SSE connection established");

    // Now send initialize request - response comes via SSE stream
    const initResult = await this.makeLegacyRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: "KateChat",
        version: "1.0.0",
      },
    });

    logger.debug({ initResult }, "Legacy initialize response");

    // Send initialized notification (no response expected)
    await this.sendLegacyNotification("notifications/initialized");

    this.isInitialized = true;
  }

  /**
   * Establish SSE connection for legacy transport
   * Keeps the connection open and processes incoming messages
   */
  private async establishLegacySSEConnection(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for SSE connection"));
      }, 15000);

      try {
        const response = await fetch(this.baseUrl, {
          method: "GET",
          dispatcher,
          headers: {
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            ...this.getCommonHeaders(),
          },
        });

        if (!response.ok) {
          clearTimeout(timeout);
          reject(new Error(`SSE connection failed (${response.status})`));
          return;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/event-stream")) {
          clearTimeout(timeout);
          reject(new Error(`Expected text/event-stream, got ${contentType}`));
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          clearTimeout(timeout);
          reject(new Error("No response body"));
          return;
        }

        this.sseReader = reader as ReadableStreamDefaultReader<Uint8Array>;
        this.sseStreamActive = true;

        let endpointReceived = false;
        let connectionEstablished = false;
        const decoder = new TextDecoder();

        const checkReady = () => {
          if (endpointReceived && connectionEstablished) {
            clearTimeout(timeout);
            resolve();
          }
        };

        const parser = createParser({
          onEvent: (event: EventSourceMessage) => {
            // Handle endpoint event
            if (event.event === "endpoint" && !endpointReceived) {
              endpointReceived = true;

              try {
                const endpointUri = event.data.trim();
                // Resolve relative URLs against base URL
                let fullUrl: string;
                try {
                  // Check if it's an absolute URL
                  new URL(endpointUri);
                  fullUrl = endpointUri;
                } catch {
                  // It's relative, resolve against base
                  const base = new URL(this.baseUrl);
                  fullUrl = new URL(endpointUri, base.origin).toString();
                }
                this.postEndpoint = fullUrl;
                checkReady();
              } catch (e) {
                clearTimeout(timeout);
                reject(new Error(`Failed to parse endpoint URI: ${event.data}`));
              }
              return;
            }

            // Handle message events (JSON-RPC responses and notifications)
            if (event.event === "message" && event.data) {
              try {
                const data = JSON.parse(event.data);
                logger.debug({ data }, "Received SSE message");

                // Check for sse/connection message indicating transport is ready
                if (data.method === "sse/connection" && !connectionEstablished) {
                  connectionEstablished = true;
                  checkReady();
                  return;
                }

                // Check if this is a response to a pending request
                if (data.id !== undefined && this.pendingRequests.has(data.id)) {
                  const pending = this.pendingRequests.get(data.id)!;
                  this.pendingRequests.delete(data.id);
                  clearTimeout(pending.timeout);

                  if (data.error) {
                    pending.reject(new Error(`MCP error: ${data.error.message || JSON.stringify(data.error)}`));
                  } else {
                    pending.resolve(data.result);
                  }
                }
              } catch (e) {
                logger.warn({ data: event.data }, "Failed to parse SSE message");
              }
            }
          },
        });

        // Start background reading of SSE stream
        const readStream = async () => {
          try {
            while (this.sseStreamActive) {
              const { done, value } = await reader.read();
              if (done) {
                logger.debug("SSE stream ended");
                this.sseStreamActive = false;
                // Reset connection state so next request will reconnect
                this.isInitialized = false;
                this.postEndpoint = undefined;
                break;
              }
              parser.feed(decoder.decode(value, { stream: true }));
            }
          } catch (e: any) {
            if (e.name !== "AbortError") {
              logger.error(e, "Error reading SSE stream");
            }
            this.sseStreamActive = false;
            // Reset connection state so next request will reconnect
            this.isInitialized = false;
            this.postEndpoint = undefined;
          }
        };

        // Start reading in background (don't await)
        readStream();
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Make a request via legacy transport
   * POST to endpoint, response comes via SSE stream
   */
  private async makeLegacyRequest(method: string, params?: Record<string, any>): Promise<any> {
    if (!this.postEndpoint || !this.sseStreamActive) {
      // Connection is dead, need to reinitialize
      this.isInitialized = false;
      await this.initializeLegacyTransport();
    }

    if (!this.postEndpoint) {
      throw new Error("Legacy transport not connected");
    }

    const id = crypto.randomUUID();
    const requestBody = {
      jsonrpc: "2.0",
      id,
      method,
      params: params || {},
    };

    logger.debug({ url: this.postEndpoint, method, id }, "Legacy MCP request");

    // Create promise that will be resolved when response arrives via SSE
    const responsePromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timeout waiting for response to ${method}`));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timeout });
    });

    // Send the request
    const response = await fetch(this.postEndpoint, {
      method: "POST",
      dispatcher,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...this.getCommonHeaders(),
      },
      body: JSON.stringify(requestBody),
    });

    // Legacy transport should return 202 Accepted
    if (!response.ok && response.status !== 202) {
      const pending = this.pendingRequests.get(id);
      if (pending) {
        this.pendingRequests.delete(id);
        clearTimeout(pending.timeout);
      }
      const errorText = await response.text();
      throw new Error(`MCP server error (${response.status}): ${errorText}`);
    }

    // Wait for response via SSE stream
    return responsePromise;
  }

  /**
   * Send a notification via legacy transport (no response expected)
   */
  private async sendLegacyNotification(method: string, params?: Record<string, any>): Promise<void> {
    if (!this.postEndpoint) {
      throw new Error("Legacy transport not connected");
    }

    const requestBody = {
      jsonrpc: "2.0",
      method,
      params: params || {},
    };

    logger.debug({ url: this.postEndpoint, method }, "Legacy MCP notification");

    const response = await fetch(this.postEndpoint, {
      method: "POST",
      dispatcher,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...this.getCommonHeaders(),
      },
      body: JSON.stringify(requestBody),
    });

    // Notifications should return 202 Accepted
    if (!response.ok && response.status !== 202) {
      const errorText = await response.text();
      logger.warn({ status: response.status, error: errorText }, "Legacy notification failed");
    }
  }

  /**
   * Parse response from MCP server (handles both JSON and SSE) - for Streamable HTTP transport
   */
  private async parseResponse(response: Response): Promise<any> {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/event-stream")) {
      // Parse SSE response
      return this.parseSSEResponse(response);
    }

    // Regular JSON response
    const result = (await response.json()) as any;

    if (result.error) {
      throw new Error(`MCP error: ${result.error.message || JSON.stringify(result.error)}`);
    }

    return result.result;
  }

  /**
   * Parse SSE response and extract the result - for Streamable HTTP transport
   */
  private async parseSSEResponse(response: Response): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for SSE response"));
      }, 30000);

      try {
        const parser = createParser({
          onEvent: (event: EventSourceMessage) => {
            if (event.data) {
              try {
                const data = JSON.parse(event.data);
                if (data.result !== undefined) {
                  clearTimeout(timeout);
                  resolve(data.result);
                } else if (data.error) {
                  clearTimeout(timeout);
                  reject(new Error(`MCP error: ${data.error.message || JSON.stringify(data.error)}`));
                }
              } catch (e) {
                logger.error({ data: event.data }, "Failed to parse SSE event data");
              }
            }
          },
        });

        const reader = response.body?.getReader();
        if (!reader) {
          clearTimeout(timeout);
          reject(new Error("No response body"));
          return;
        }

        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }

        clearTimeout(timeout);
        reject(new Error("SSE stream ended without result"));
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Send a notification (no response expected) - for Streamable HTTP transport
   */
  private async sendNotification(method: string, params?: Record<string, any>): Promise<void> {
    const targetUrl = this.postEndpoint || this.baseUrl;

    const requestBody = {
      jsonrpc: "2.0",
      method,
      params: params || {},
    };

    logger.debug({ url: targetUrl, method }, "Sending MCP notification");

    const response = await fetch(targetUrl, {
      method: "POST",
      dispatcher,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...this.getCommonHeaders(),
      },
      body: JSON.stringify(requestBody),
    });

    // Notifications should return 202 Accepted or 200 OK
    if (!response.ok && response.status !== 202) {
      const errorText = await response.text();
      logger.warn({ status: response.status, error: errorText }, "Notification failed");
    }
  }

  /**
   * Make a JSON-RPC request to the MCP server
   */
  private async makeRequest(method: string, params?: Record<string, any>): Promise<any> {
    // Ensure we're initialized
    if (!this.isInitialized) {
      await this.detectTransportAndInitialize();
    }

    // Use legacy transport method if applicable
    if (this.transportType === "http-sse-legacy") {
      return this.makeLegacyRequest(method, params);
    }

    // Streamable HTTP transport
    const targetUrl = this.postEndpoint || this.baseUrl;

    const requestBody = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params: params || {},
    };

    logger.debug({ url: targetUrl, method, params }, "MCP request");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...this.getCommonHeaders(),
    };

    // Add protocol version header for new transport
    headers["MCP-Protocol-Version"] = "2025-11-25";

    const response = await fetch(targetUrl, {
      method: "POST",
      dispatcher,
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MCP server error (${response.status}): ${errorText}`);
    }

    return this.parseResponse(response);
  }

  /**
   * Initialize connection with the MCP server
   */
  async initialize(): Promise<{ protocolVersion: string; capabilities: Record<string, any>; serverInfo: any }> {
    await this.detectTransportAndInitialize();
    return {
      protocolVersion: this.transportType === "streamable-http" ? "2025-11-25" : "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "MCP Server" },
    };
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<MCPToolDefinition[]> {
    try {
      // Ensure initialized
      if (!this.isInitialized) {
        await this.detectTransportAndInitialize();
      }

      const result = await this.makeRequest("tools/list");

      if (!result || !result.tools) {
        return [];
      }

      return result.tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
    } catch (error) {
      logger.error(error, "Failed to list tools");
      throw error;
    }
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(toolName: string, args: Record<string, any>): Promise<MCPToolResult> {
    const result = await this.makeRequest("tools/call", {
      name: toolName,
      arguments: args,
    });

    return {
      content: result?.content || [],
      isError: result?.isError || false,
    };
  }

  /**
   * Close the MCP client connection
   */
  async close(): Promise<void> {
    this.sseStreamActive = false;

    // Cancel all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Connection closed"));
    }
    this.pendingRequests.clear();

    // Close SSE reader if exists
    if (this.sseReader) {
      try {
        await this.sseReader.cancel();
      } catch (e) {
        // Ignore close errors
      }
      this.sseReader = undefined;
    }

    this.isInitialized = false;
  }

  /**
   * Convert MCP tool definitions to OpenAI tool format
   */
  static toOpenAITools(
    tools: MCPToolDefinition[],
    serverName: string
  ): Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, any>;
    };
  }> {
    return tools.map(tool => ({
      type: "function" as const,
      function: {
        name: `mcp_${serverName}_${tool.name}`,
        description: tool.description,
        parameters: tool.inputSchema || { type: "object", properties: {} },
      },
    }));
  }

  /**
   * Convert MCP tool definitions to Bedrock tool format
   */
  static toBedrockTools(
    tools: MCPToolDefinition[],
    serverName: string
  ): Array<{
    toolSpec: {
      name: string;
      description?: string;
      inputSchema: {
        json: Record<string, any>;
      };
    };
  }> {
    return tools.map(tool => ({
      toolSpec: {
        name: `mcp_${serverName}_${tool.name}`,
        description: tool.description,
        inputSchema: {
          json: tool.inputSchema || { type: "object", properties: {} },
        },
      },
    }));
  }
}

/**
 * Helper to parse MCP tool name back to server and tool parts
 */
export function parseMCPToolName(toolName: string): { serverName: string; originalToolName: string } | null {
  const match = toolName.match(/^mcp_(.+?)_(.+)$/);
  if (!match) {
    return null;
  }
  return {
    serverName: match[1],
    originalToolName: match[2],
  };
}
