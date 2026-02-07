import OpenAI from "openai";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { WEB_SEARCH_TOOL_NAME, YandexWebSearch } from "../tools/yandex.web_search";
import { MCPClient, parseMCPToolName, MCPToolDefinition } from "../tools/mcp.client";
import { MCPServer } from "@/entities";
import { WEB_SEARCH_TOOL_RESULT } from "@/config/ai/prompts";
import { ChatTool, ResponseStatus } from "@/types/ai.types";
import { createLogger } from "@/utils/logger";
import { notEmpty, ok } from "@/utils/assert";

const logger = createLogger(__filename);

export interface ChatCompletionToolCall {
  name?: string;
  type?: "function" | "custom" | "mcp";
  callId: string;
  arguments?: Record<string, any> | undefined;
  error?: string | undefined;
}

export type ChatCompletionToolCallable = OpenAI.Chat.Completions.ChatCompletionTool & {
  name: string;
  status?: ResponseStatus;
  call: (
    args: Record<string, any>,
    callId: string,
    connection: ConnectionParams
  ) => Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam>;
};

export const CustomWebSearchTool: ChatCompletionToolCallable = {
  type: "function",
  name: WEB_SEARCH_TOOL_NAME,
  status: ResponseStatus.WEB_SEARCH,
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

/**
 * Convert MCP tool definitions to OpenAI tool format
 */
export function formatOpenAIMcpTools(tools?: ChatTool[], mcpServers?: MCPServer[]): ChatCompletionToolCallable[] {
  if (!tools?.length || !mcpServers?.length) {
    return [];
  }
  const serverMap = new Map(mcpServers.map(server => [server.id, server]));

  return tools.flatMap(tool => {
    ok(tool.id);
    const server = tool.id ? serverMap.get(tool.id) : undefined;
    ok(server);

    return (
      server.tools
        ?.map((mcpTool, ndx) => {
          ok(mcpTool.inputSchema);
          const name = `M_${server.id.replace(/-/g, "")}_${ndx}`;
          const callable: ChatCompletionToolCallable = {
            type: "function" as const,
            name,
            status: ResponseStatus.MCP_CALL,
            function: {
              name,
              description: `${mcpTool.name}: ${mcpTool.description || `tool from ${server.name}`}`,
              parameters: JSON.parse(mcpTool.inputSchema),
            },

            call: (args: Record<string, any>, callId: string) => {
              return callMcpTool(mcpTool.name, args, callId, server);
            },
          };

          return callable;
        })
        ?.filter(notEmpty) || []
    );
  });
}

/**
 * Call an MCP tool for OpenAI
 */
async function callMcpTool(
  toolName: string,
  args: Record<string, any>,
  callId: string,
  server: MCPServer
): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
  const client = MCPClient.connect(server);

  try {
    const result = await client.callTool(toolName, args);

    // Format the result content
    const textContent = result.content
      .map(item => {
        if (typeof item === "string") return item;
        if (item.type === "text" && "text" in item) return item.text;
        return JSON.stringify(item);
      })
      .join("\n");

    logger.debug({ toolName, server: server.name, textContent }, "MCP tool call result for OpenAI");

    return {
      role: "tool",
      tool_call_id: callId,
      content: textContent,
    };
  } catch (error) {
    logger.error({ error, toolName, server: server.name }, "Failed to call MCP tool for OpenAI");
    return {
      role: "tool",
      tool_call_id: callId,
      content: `Error calling MCP tool: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    await client.close();
  }
}

/**
 * MCP tool callable for OpenAI Responses API
 */
export type ResponsesMcpToolCallable = OpenAI.Responses.FunctionTool & {
  mcpToolName: string;
  serverId: string;
  status: ResponseStatus;
  call: (args: Record<string, any>, callId: string, server: MCPServer) => Promise<string | undefined>;
};

/**
 * Convert MCP tool definitions to OpenAI Responses API function tool format
 */
export function formatResponsesMcpTools(tools?: ChatTool[], mcpServers?: MCPServer[]): ResponsesMcpToolCallable[] {
  if (!tools?.length || !mcpServers?.length) {
    return [];
  }
  const serverMap = new Map(mcpServers.map(server => [server.id, server]));

  return tools.flatMap(tool => {
    ok(tool.id);
    const server = tool.id ? serverMap.get(tool.id) : undefined;
    ok(server);

    return (
      server.tools
        ?.map((mcpTool, ndx) => {
          ok(mcpTool.inputSchema);
          const name = `M_${server.id.replace(/-/g, "")}_${ndx}`;
          const callable: ResponsesMcpToolCallable = {
            type: "function" as const,
            name,
            mcpToolName: mcpTool.name,
            serverId: server.id,
            status: ResponseStatus.MCP_CALL,
            description: `${mcpTool.name}: ${mcpTool.description || `tool from ${server.name}`}`,
            parameters: JSON.parse(mcpTool.inputSchema),
            strict: null, // Allow flexible schema validation for MCP tools

            call: async (args: Record<string, any>, callId: string, srv: MCPServer) => {
              return callMcpTool(mcpTool.name, args, callId, srv).then(result => {
                const content = result.content;
                if (typeof content === "string") return content;
                if (Array.isArray(content)) {
                  return content
                    .map(item => {
                      if (typeof item === "string") return item;
                      if ("text" in item) return item.text;
                      return JSON.stringify(item);
                    })
                    .join("\n");
                }
                return "";
              });
            },
          };

          return callable;
        })
        ?.filter(notEmpty) || []
    );
  });
}
