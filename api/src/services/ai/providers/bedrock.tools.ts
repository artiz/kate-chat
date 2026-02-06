import { Tool, ToolResultBlock, ToolUseBlock } from "@aws-sdk/client-bedrock-runtime";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { YandexWebSearch } from "../tools/yandex.web_search";
import { MCPClient, parseMCPToolName, MCPToolDefinition } from "../tools/mcp.client";
import { MCPServer } from "@/entities";
import { WEB_SEARCH_TOOL_RESULT } from "@/config/ai/prompts";
import { createLogger } from "@/utils/logger";

const logger = createLogger(__filename);

export interface BedrockToolCall {
  name: string;
  toolUseId: string;
  input: Record<string, any>;
  error?: string;
}

export type BedrockToolCallable = Tool & {
  call: (args: Record<string, any>, toolUseId: string, connection: ConnectionParams) => Promise<ToolResultBlock>;
};

export const WEB_SEARCH_TOOL_NAME = "web_search";

export const WEB_SEARCH_TOOL: BedrockToolCallable = {
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

export const BEDROCK_TOOLS: Record<string, BedrockToolCallable> = {
  [WEB_SEARCH_TOOL_NAME]: WEB_SEARCH_TOOL,
};

/**
 * Call an MCP tool through Bedrock
 */
export async function callMCPTool(
  toolName: string,
  args: Record<string, any>,
  toolUseId: string,
  mcpServers: MCPServer[]
): Promise<ToolResultBlock> {
  const parsed = parseMCPToolName(toolName);
  if (!parsed) {
    return {
      toolUseId,
      content: [{ text: `Error: Invalid MCP tool name format: ${toolName}` }],
      status: "error",
    };
  }

  const { serverName, originalToolName } = parsed;

  // Find the server by name
  const server = mcpServers.find(s => s.name === serverName);
  if (!server) {
    return {
      toolUseId,
      content: [{ text: `Error: MCP server not found: ${serverName}` }],
      status: "error",
    };
  }

  const client = MCPClient.connect(server);

  try {
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
      toolUseId,
      content: [{ text: textContent }],
      status: result.isError ? "error" : undefined,
    };
  } catch (error) {
    logger.error({ error, toolName, serverName }, "Failed to call MCP tool");
    return {
      toolUseId,
      content: [{ text: `Error calling MCP tool: ${error instanceof Error ? error.message : String(error)}` }],
      status: "error",
    };
  } finally {
    await client.close();
  }
}

export function parseToolUse(toolUse: ToolUseBlock): BedrockToolCall {
  const toolUseId = toolUse.toolUseId || "unknown_id";
  const name = toolUse.name || "";

  // Check if it's an MCP tool
  if (name.startsWith("mcp_")) {
    return {
      toolUseId,
      name,
      input: typeof toolUse.input === "string" ? JSON.parse(toolUse.input) : toolUse.input || {},
    };
  }

  const tool = BEDROCK_TOOLS[name];
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
  mcpServers?: MCPServer[]
): Promise<ToolResultBlock> {
  // Check if it's an MCP tool
  if (toolCall.name.startsWith("mcp_") && mcpServers) {
    return callMCPTool(toolCall.name, toolCall.input, toolCall.toolUseId, mcpServers);
  }

  const tool = BEDROCK_TOOLS[toolCall.name];
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
    return await tool.call(toolCall.input, toolCall.toolUseId, connection);
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
