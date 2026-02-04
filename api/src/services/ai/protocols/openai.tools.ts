import OpenAI from "openai";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { YandexWebSearch } from "../tools/yandex.web_search";
import { MCPClient, parseMCPToolName, MCPToolDefinition } from "../tools/mcp.client";
import { MCPServer } from "@/entities";
import { WEB_SEARCH_TOOL_RESULT } from "@/config/ai/prompts";
import { ResponseStatus } from "@/types/ai.types";
import { createLogger } from "@/utils/logger";

const logger = createLogger(__filename);

export interface ChatCompletionToolCall {
  name?: string;
  type?: "function" | "custom" | "mcp";
  callId: string;
  arguments?: Record<string, any> | undefined;
  error?: string | undefined;
}

export type ChatCompletionToolCallable = OpenAI.Chat.Completions.ChatCompletionTool & {
  call: (
    args: Record<string, any>,
    callId: string,
    connection: ConnectionParams
  ) => Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam>;
};

export const WEB_SEARCH_TOOL_NAME = "web_search";

export const WEB_SEARCH_TOOL: ChatCompletionToolCallable = {
  type: "function",
  function: {
    name: WEB_SEARCH_TOOL_NAME,
    description: "Search the web for relevant information",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query",
        },
        limit: {
          type: "number",
          description: "Maximum number of search results to return",
        },
      },
      required: ["query"],
    },
  },

  call: async (
    args: Record<string, any>,
    callId: string,
    connection: ConnectionParams
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam> => {
    if (!args.query) {
      return {
        role: "tool",
        tool_call_id: callId,
        content: `Error: Invalid 'query' argument for web search tool: ${args.query || "N/A"}.`,
      };
    }

    const results = await YandexWebSearch.search(
      {
        query: args.query,
        limit: args.limit,
        loadContent: true,
      },
      connection
    );

    if (!results.length) {
      return {
        role: "tool",
        tool_call_id: callId,
        content: `No results found for query: "${args.query}"`,
      };
    }

    const content = WEB_SEARCH_TOOL_RESULT(results);
    return {
      role: "tool",
      tool_call_id: callId,
      content,
    };
  },
};

export const COMPLETION_API_TOOLS: Record<string, ChatCompletionToolCallable> = {
  [WEB_SEARCH_TOOL_NAME]: WEB_SEARCH_TOOL,
};

export const COMPLETION_API_TOOLS_TO_STATUS: Record<string, ResponseStatus> = {
  [WEB_SEARCH_TOOL_NAME]: ResponseStatus.WEB_SEARCH,
};

// MCP Tools cache for OpenAI
const MCP_TOOLS_CACHE: Map<string, { tools: MCPToolDefinition[]; server: MCPServer; timestamp: number }> = new Map();
const MCP_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get MCP tools for OpenAI format
 */
export async function getMCPToolsForOpenAI(
  mcpServers: MCPServer[]
): Promise<OpenAI.Chat.Completions.ChatCompletionTool[]> {
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];

  for (const server of mcpServers) {
    if (!server.isActive) continue;

    try {
      // Check cache
      const cached = MCP_TOOLS_CACHE.get(server.id);
      if (cached && Date.now() - cached.timestamp < MCP_CACHE_TTL) {
        tools.push(...MCPClient.toOpenAITools(cached.tools, server.name));
        continue;
      }

      // Fetch from server
      const client = new MCPClient(server);
      const mcpTools = await client.listTools();

      // Cache the tools
      MCP_TOOLS_CACHE.set(server.id, {
        tools: mcpTools,
        server,
        timestamp: Date.now(),
      });

      tools.push(...MCPClient.toOpenAITools(mcpTools, server.name));
    } catch (error) {
      logger.error({ error, serverId: server.id }, "Failed to get MCP tools for OpenAI");
    }
  }

  return tools;
}

/**
 * Call an MCP tool for OpenAI
 */
export async function callMCPToolForOpenAI(
  toolName: string,
  args: Record<string, any>,
  callId: string,
  mcpServers: MCPServer[]
): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
  const parsed = parseMCPToolName(toolName);
  if (!parsed) {
    return {
      role: "tool",
      tool_call_id: callId,
      content: `Error: Invalid MCP tool name format: ${toolName}`,
    };
  }

  const { serverName, originalToolName } = parsed;

  // Find the server by name
  const server = mcpServers.find(s => s.name === serverName);
  if (!server) {
    return {
      role: "tool",
      tool_call_id: callId,
      content: `Error: MCP server not found: ${serverName}`,
    };
  }

  try {
    const client = new MCPClient(server);
    const result = await client.callTool(originalToolName, args);

    // Format the result content
    const textContent = result.content
      .map((item: any) => {
        if (typeof item === "string") return item;
        if (item.type === "text") return item.text;
        return JSON.stringify(item);
      })
      .join("\n");

    return {
      role: "tool",
      tool_call_id: callId,
      content: textContent,
    };
  } catch (error) {
    logger.error({ error, toolName, serverName }, "Failed to call MCP tool for OpenAI");
    return {
      role: "tool",
      tool_call_id: callId,
      content: `Error calling MCP tool: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
