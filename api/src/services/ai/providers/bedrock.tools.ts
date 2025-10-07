import { Tool, ToolResultBlock, ToolUseBlock } from "@aws-sdk/client-bedrock-runtime";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { YandexWebSearch } from "../tools/yandex.web_search";
import { WEB_SEARCH_TOOL_RESULT } from "@/config/ai/prompts";

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

export function parseToolUse(toolUse: ToolUseBlock): BedrockToolCall {
  const toolUseId = toolUse.toolUseId || "unknown_id";
  const name = toolUse.name || "";

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
  connection: ConnectionParams
): Promise<ToolResultBlock> {
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
