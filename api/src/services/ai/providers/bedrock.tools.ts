import { Tool, ToolResultBlock, ToolUseBlock } from "@aws-sdk/client-bedrock-runtime";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { WEB_SEARCH_TOOL_NAME, YandexWebSearch } from "../tools/yandex.web_search";
import { MCPClient } from "../tools/mcp.client";
import { MCPServer } from "@/entities";
import { WEB_SEARCH_TOOL_RESULT } from "@/config/ai/prompts";
import { createLogger } from "@/utils/logger";
import { ResponseStatus, ToolType } from "@/types/api";
import { ChatTool, IMCPServer, MCPAuthToken } from "@/types/ai.types";
import { notEmpty, ok } from "@/utils/assert";

// Re-export for backward compatibility
export { WEB_SEARCH_TOOL_NAME };

const logger = createLogger(__filename);

export interface BedrockToolCall {
  name: string;
  toolUseId: string;
  input: Record<string, any>;
  error?: string;
}

export type BedrockToolCallable = Tool & {
  name: string;
  mcpToolName?: string; // Original MCP tool name for calling
  status?: ResponseStatus;
  call: (
    args: Record<string, any>,
    toolUseId: string,
    connection: ConnectionParams,
    mcpTokens?: MCPAuthToken[]
  ) => Promise<ToolResultBlock>;
};

export const WEB_SEARCH_TOOL: BedrockToolCallable = {
  name: WEB_SEARCH_TOOL_NAME,
  status: ResponseStatus.WEB_SEARCH,
  toolSpec: {
    name: WEB_SEARCH_TOOL_NAME,
    description: "Search the web for relevant information",
    inputSchema: {
      json: {
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
  },

  call: async (
    args: Record<string, any>,
    toolUseId: string,
    connection: ConnectionParams
  ): Promise<ToolResultBlock> => {
    if (!args.query) {
      return {
        toolUseId,
        content: [
          {
            text: `Error: Invalid 'query' argument for web search tool: ${args.query || "N/A"}.`,
          },
        ],
        status: "error",
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
        toolUseId,
        content: [
          {
            text: `No results found for query: "${args.query}"`,
          },
        ],
      };
    }

    const content = WEB_SEARCH_TOOL_RESULT(results);
    return {
      toolUseId,
      content: [{ text: content }],
    };
  },
};

/**
 * Call an MCP tool for Bedrock
 */
async function callMcpTool(
  toolName: string,
  args: Record<string, any>,
  toolUseId: string,
  server: IMCPServer,
  mcpTokens?: MCPAuthToken[]
): Promise<ToolResultBlock> {
  // Find matching OAuth token for this server
  const oauthToken = mcpTokens?.find(t => t.serverId === server.id);
  const client = MCPClient.connect(server, oauthToken);

  try {
    const result = await client.callTool(toolName, args);

    // Format the result content
    const textContent = result.content
      .map((item: any) => {
        if (typeof item === "string") return item;
        if (item.type === "text" && "text" in item) return item.text;
        return JSON.stringify(item);
      })
      .join("\n");

    logger.debug({ toolName, server: server.name, textContent }, "MCP tool call result for Bedrock");

    return {
      toolUseId,
      content: [{ text: textContent }],
      status: result.isError ? "error" : undefined,
    };
  } catch (error) {
    logger.error({ error, toolName, server: server.name }, "Failed to call MCP tool for Bedrock");
    return {
      toolUseId,
      content: [{ text: `Error calling MCP tool: ${error instanceof Error ? error.message : String(error)}` }],
      status: "error",
    };
  } finally {
    await client.close();
  }
}

/**
 * Convert MCP tool definitions to Bedrock tool format (similar to formatOpenAIMcpTools)
 */
export function formatBedrockMcpTools(tools?: ChatTool[], mcpServers?: IMCPServer[]): BedrockToolCallable[] {
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
          const callable: BedrockToolCallable = {
            name,
            mcpToolName: mcpTool.name,
            status: ResponseStatus.MCP_CALL,
            toolSpec: {
              name,
              description: `${mcpTool.name}: ${mcpTool.description || `tool from ${server.name}`}`,
              inputSchema: {
                json: JSON.parse(mcpTool.inputSchema),
              },
            },

            call: (
              args: Record<string, any>,
              toolUseId: string,
              _connection: ConnectionParams,
              mcpTokens?: MCPAuthToken[]
            ) => {
              return callMcpTool(mcpTool.name, args, toolUseId, server, mcpTokens);
            },
          };

          return callable;
        })
        ?.filter(notEmpty) || []
    );
  });
}

/**
 * Format request tools for Bedrock (combines web search and MCP tools)
 */
export function formatBedrockRequestTools(inputTools?: ChatTool[], mcpServers?: IMCPServer[]): BedrockToolCallable[] {
  if (!inputTools?.length) {
    return [];
  }

  const tools: BedrockToolCallable[] = [];

  // Add web search tool if requested
  if (inputTools.find(t => t.type === ToolType.WEB_SEARCH)) {
    tools.push(WEB_SEARCH_TOOL);
  }

  // Add MCP tools
  const mcpTools = formatBedrockMcpTools(
    inputTools.filter(t => t.type === ToolType.MCP),
    mcpServers
  );
  tools.push(...mcpTools);

  return tools;
}

export function parseToolUse(toolUse: ToolUseBlock, tools: BedrockToolCallable[]): BedrockToolCall {
  const toolUseId = toolUse.toolUseId || "unknown_id";
  const name = toolUse.name || "";

  // Find the tool in the provided tools list by name
  const tool = tools.find(t => t.name === name);
  if (!tool) {
    return {
      toolUseId,
      name,
      input: {},
      error: `Unsupported tool: ${name}`,
    };
  }

  return {
    toolUseId,
    name,
    input: typeof toolUse.input === "string" ? JSON.parse(toolUse.input) : toolUse.input || {},
  };
}

export async function callBedrockTool(
  toolCall: BedrockToolCall,
  connection: ConnectionParams,
  tools: BedrockToolCallable[],
  mcpTokens?: MCPAuthToken[]
): Promise<ToolResultBlock> {
  // Find the tool in the provided tools list by name
  const tool = tools.find(t => t.name === toolCall.name);
  if (!tool) {
    return {
      toolUseId: toolCall.toolUseId,
      content: [
        {
          text: `Error: Unsupported tool: ${toolCall.name}`,
        },
      ],
      status: "error",
    };
  }

  try {
    return await tool.call(toolCall.input, toolCall.toolUseId, connection, mcpTokens);
  } catch (error) {
    return {
      toolUseId: toolCall.toolUseId,
      content: [
        {
          text: `Error executing tool ${toolCall.name}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      status: "error",
    };
  }
}
