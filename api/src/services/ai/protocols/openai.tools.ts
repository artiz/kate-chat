import OpenAI from "openai";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { YandexWebSearch } from "../tools/yandex.web_search";
import { WEB_SEARCH_TOOL_RESULT } from "@/config/ai/prompts";
import { ResponseStatus } from "@/types/ai.types";

export interface ChatCompletionToolCall {
  name?: string;
  type?: "function" | "custom";
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
