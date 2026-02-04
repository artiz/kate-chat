import { Agent, fetch } from "undici";
import { MCPServer, MCPAuthType, MCPAuthConfig } from "@/entities";
import { createLogger } from "@/utils/logger";
import { APP_USER_AGENT } from "@/config/application";

const logger = createLogger(__filename);

const dispatcher = new Agent({
  connectTimeout: 30_000,
  bodyTimeout: 60_000,
  keepAliveTimeout: 30_000,
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

/**
 * MCP Client for communicating with Model Context Protocol servers
 * Implements the Streamable HTTP transport as per MCP specification
 * https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http
 */
export class MCPClient {
  private server: MCPServer;
  private baseUrl: string;

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
   * Make a JSON-RPC request to the MCP server
   */
  private async makeRequest(method: string, params?: Record<string, any>): Promise<any> {
    const requestBody = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params: params || {},
    };

    logger.trace({ url: this.baseUrl, method, params }, "MCP request");

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        dispatcher,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "User-Agent": APP_USER_AGENT,
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MCP server error (${response.status}): ${errorText}`);
      }

      const contentType = response.headers.get("content-type") || "";

      // Handle Server-Sent Events (SSE) response
      if (contentType.includes("text/event-stream")) {
        const text = await response.text();
        return this.parseSSEResponse(text);
      }

      // Handle regular JSON response
      const result = (await response.json()) as any;

      if (result.error) {
        throw new Error(`MCP error: ${result.error.message || JSON.stringify(result.error)}`);
      }

      return result.result;
    } catch (error) {
      logger.error(error, "MCP request failed");
      throw error;
    }
  }

  /**
   * Parse Server-Sent Events response text
   */
  private parseSSEResponse(text: string): any {
    const lines = text.split("\n");

    let lastData: any = null;

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.result !== undefined) {
            lastData = data.result;
          }
        } catch (e) {
          // Skip non-JSON lines
        }
      }
    }

    return lastData;
  }

  /**
   * Initialize connection with the MCP server
   */
  async initialize(): Promise<{ protocolVersion: string; capabilities: Record<string, any>; serverInfo: any }> {
    const result = await this.makeRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: "KateChat",
        version: "1.0.0",
      },
    });

    // Send initialized notification
    await this.makeRequest("notifications/initialized");

    return result;
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<MCPToolDefinition[]> {
    try {
      // Try to initialize first if needed
      await this.initialize();
    } catch (e) {
      logger.warn(e, "Initialize failed, trying listTools directly");
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
