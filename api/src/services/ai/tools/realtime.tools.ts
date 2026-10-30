import OpenAI from "openai";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { ApiProvider, ModelType, ToolType } from "@/types/api";
import { ChatTool, CompleteChatRequest, IMCPServer, MCPAuthToken } from "@/types/ai.types";
import { createLogger } from "@/utils/logger";
import { ChatCompletionToolCallable, CustomWebSearchTool, formatOpenAIMcpTools } from "../protocols/openai.tools";

const logger = createLogger(__filename);

/** A function tool as a realtime session takes it (session.tools), the same shape for OpenAI and Yandex */
export interface RealtimeFunctionTool {
  type: "function";
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

export interface RealtimeToolSet {
  tools: RealtimeFunctionTool[];
  /** Runs a call the model made; the text goes back to the model as the function's output */
  call(name: string, args: string, callId: string): Promise<string>;
}

/** A document of the chat that the user picked for RAG and that is ready to search */
export interface RealtimeChatDocument {
  id: string;
  name: string;
}

export interface RealtimeDocumentChunk {
  documentName?: string;
  page?: number;
  content: string;
}

export interface RealtimeToolsInput {
  chatTools?: ChatTool[];
  apiProvider: ApiProvider;
  modelId: string;
  connection: ConnectionParams;
  mcpServers?: IMCPServer[];
  mcpTokens?: MCPAuthToken[];
  /** false: tools of servers that ask first run without asking (a voice session cannot show the card) */
  mcpToolApprovals?: boolean;
  documents?: RealtimeChatDocument[];
  findChunks?: (documentIds: string[], query: string) => Promise<RealtimeDocumentChunk[]>;
}

export const SEARCH_DOCUMENTS_TOOL_NAME = "search_chat_documents";

// a realtime session's context is small and every token of it is billed as audio-session input
export const REALTIME_TOOL_OUTPUT_LIMIT = 20_000;

const searchDocumentsTool = (
  documents: RealtimeChatDocument[],
  findChunks: NonNullable<RealtimeToolsInput["findChunks"]>
): ChatCompletionToolCallable => ({
  type: "function",
  name: SEARCH_DOCUMENTS_TOOL_NAME,
  function: {
    name: SEARCH_DOCUMENTS_TOOL_NAME,
    description:
      "Search the documents the user attached to this chat and get the passages that answer a question. " +
      `Documents: ${documents.map(doc => doc.name).join(", ")}.`,
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "What to look for, as a question or key words" } },
      required: ["query"],
    },
  },
  call: async (args, callId) => {
    const query = String(args.query || "").trim();
    const chunks = query
      ? await findChunks(
          documents.map(doc => doc.id),
          query
        )
      : [];
    const content = chunks.length
      ? chunks
          .map(
            chunk =>
              `[${chunk.documentName || "document"}${chunk.page ? `, page ${chunk.page}` : ""}]\n${chunk.content}`
          )
          .join("\n\n")
      : `Nothing in the chat's documents matches "${query}".`;
    return { role: "tool", tool_call_id: callId, content };
  },
});

const toText = (content: OpenAI.Chat.Completions.ChatCompletionMessageParam["content"]): string =>
  typeof content === "string"
    ? content
    : (content || []).map(part => ("text" in part ? part.text : "refusal" in part ? part.refusal : "")).join("\n");

/**
 * The chat's tools as function tools for a realtime voice session: the MCP servers and web search
 * picked for the chat, and a search over the documents picked for RAG. The calls run on the API, where
 * the MCP tokens and search keys are; a realtime session cannot show the approval card, so tools of
 * servers that ask first are declined unless the user turned approvals off.
 */
export function buildRealtimeTools(input: RealtimeToolsInput): RealtimeToolSet {
  const { chatTools = [], connection, mcpTokens } = input;
  const request: CompleteChatRequest = {
    apiProvider: input.apiProvider,
    modelId: input.modelId,
    modelType: ModelType.REALTIME,
    approveToolCall: input.mcpToolApprovals === false ? async () => true : undefined,
  };

  const callables: ChatCompletionToolCallable[] = [];
  if (
    chatTools.some(tool => tool.type === ToolType.WEB_SEARCH) &&
    connection.yandexSearchApiKey &&
    connection.yandexSearchApiFolder
  ) {
    callables.push(CustomWebSearchTool);
  }

  const mcpTools = chatTools.filter(tool => tool.type === ToolType.MCP && tool.id);
  const servers = (input.mcpServers || []).filter(server => mcpTools.some(tool => tool.id === server.id));
  if (servers.length) {
    callables.push(
      ...formatOpenAIMcpTools(
        mcpTools.filter(tool => servers.some(server => server.id === tool.id)),
        servers,
        request
      )
    );
  }

  if (input.documents?.length && input.findChunks) {
    callables.push(searchDocumentsTool(input.documents, input.findChunks));
  }

  return {
    tools: callables
      .filter(tool => tool.type === "function")
      .map(tool => ({
        type: "function",
        name: tool.function.name,
        description: tool.function.description,
        parameters: (tool.function.parameters || { type: "object", properties: {} }) as Record<string, unknown>,
      })),

    call: async (name, args, callId) => {
      const tool = callables.find(callable => callable.name === name);
      if (!tool) return `Error: there is no tool "${name}" in this session.`;

      let parsed: Record<string, unknown>;
      try {
        parsed = args ? JSON.parse(args) : {};
      } catch {
        return `Error: the arguments of ${name} are not valid JSON.`;
      }

      try {
        const result = await tool.call(parsed, callId, connection, mcpTokens);
        return toText(result.content).slice(0, REALTIME_TOOL_OUTPUT_LIMIT);
      } catch (error) {
        logger.warn({ error, name }, "Realtime tool call failed");
        return `Error calling ${name}: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };
}
