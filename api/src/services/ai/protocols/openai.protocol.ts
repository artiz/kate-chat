import OpenAI from "openai";
import {
  ModelMessage,
  ModelResponse,
  StreamCallbacks,
  CompleteChatRequest,
  GetEmbeddingsRequest,
  EmbeddingsResponse,
  ChatResponseStatus,
  MCPAuthToken,
} from "@/types/ai.types";
import { MessageRole, ResponseStatus } from "@/types/api";
import { createLogger } from "@/utils/logger";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { ChatCompletionToolCall, ChatCompletionToolCallable } from "./openai.tools";
import { FileContentLoader } from "@/services/data";
import { ModelProtocol, ModelProtocolErrorProcessor } from "./common";

const logger = createLogger(__filename);

export const RETRY_TIMEOUT_MS = 100;
export const RETRY_COUNT = 10;

export type OpenAIApiType = "completions" | "responses";

export interface OpenAiParamsProcessor {
  responsesRequest(
    inputRequest: CompleteChatRequest,
    params: OpenAI.Responses.ResponseCreateParamsNonStreaming
  ): OpenAI.Responses.ResponseCreateParamsNonStreaming;
  completionRequest(
    inputRequest: CompleteChatRequest,
    params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
  ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
}

export class OpenAIDefaultErrorProcessor implements ModelProtocolErrorProcessor {
  isInputTooLargeError(_error: unknown): boolean {
    return false;
  }
  isRateLimitError(error: unknown): boolean {
    return error instanceof OpenAI.APIError && error.code === "rate_limit_exceeded";
  }
}

export interface OpenAIProtocolOptions {
  baseURL: string;
  apiKey?: string;
  modelIdOverride?: string;
  connection?: ConnectionParams;
  fileLoader?: FileContentLoader;
  errorProcessor?: ModelProtocolErrorProcessor;
  paramsProcessor?: OpenAiParamsProcessor;
}

export abstract class OpenAIProtocolBase implements ModelProtocol {
  protected readonly openai: OpenAI;
  protected readonly connection?: ConnectionParams;
  protected readonly fileLoader?: FileContentLoader;
  protected readonly errorProcessor: ModelProtocolErrorProcessor;
  protected readonly paramsProcessor?: OpenAiParamsProcessor;
  protected readonly modelIdOverride?: string;

  constructor({
    baseURL,
    apiKey,
    connection,
    fileLoader,
    errorProcessor = new OpenAIDefaultErrorProcessor(),
    modelIdOverride,
    paramsProcessor,
  }: OpenAIProtocolOptions) {
    this.connection = connection;
    this.fileLoader = fileLoader;
    this.modelIdOverride = modelIdOverride;
    this.errorProcessor = errorProcessor;
    this.paramsProcessor = paramsProcessor;

    this.openai = new OpenAI({
      apiKey,
      baseURL,
      maxRetries: 3,
    });

    logger.trace({ baseURL, modelIdOverride }, `${this.constructor.name} initialized`);
  }

  get api(): OpenAI {
    return this.openai;
  }

  abstract get type(): OpenAIApiType;

  abstract completeChat(request: CompleteChatRequest, messages: ModelMessage[]): Promise<ModelResponse>;

  abstract streamChatCompletion(
    inputRequest: CompleteChatRequest,
    messages: ModelMessage[],
    callbacks: StreamCallbacks
  ): Promise<void>;

  abstract stopRequest(requestId: string): Promise<void>;

  async getEmbeddings(request: GetEmbeddingsRequest, retry: number = 0): Promise<EmbeddingsResponse> {
    const { modelId: requestModelId, input, dimensions } = request;
    const modelId = this.modelIdOverride || requestModelId;

    const params: OpenAI.Embeddings.EmbeddingCreateParams = {
      model: modelId,
      input,
      encoding_format: "float",
      dimensions,
    };

    try {
      const response = await this.openai.embeddings.create(params);
      const embedding = response.data[0]?.embedding;
      const usage = response.usage || {};
      return {
        embedding,
        metadata: {
          usage: {
            inputTokens: usage?.prompt_tokens || 0,
          },
        },
      };
    } catch (error: unknown) {
      if (this.errorProcessor.isRateLimitError(error) && retry < RETRY_COUNT) {
        return new Promise(res => setTimeout(res, RETRY_TIMEOUT_MS)).then(() => this.getEmbeddings(request, retry + 1));
      }

      logger.warn(error, "Error getting embeddings from OpenAI API");
      throw error;
    }
  }

  protected mapMessageRole(role: MessageRole): "user" | "assistant" | "developer" {
    switch (role) {
      case MessageRole.USER:
        return "user";
      case MessageRole.ASSISTANT:
      case MessageRole.ERROR:
        return "assistant";
      case MessageRole.SYSTEM:
        return "developer";
      default:
        return "user";
    }
  }

  protected parseCompletionToolCallResult(result: OpenAI.Chat.Completions.ChatCompletionMessageParam): string {
    if (!result.content || typeof result.content === "string") {
      return result.content || "";
    }

    const contentParts: string[] = [];
    result.content.forEach(part => {
      if ("text" in part) {
        contentParts.push(part.text);
      } else if ("refusal" in part) {
        contentParts.push(part.refusal);
      }
    });

    return contentParts.join("\n");
  }

  protected callCompletionTools(
    toolCalls: ChatCompletionToolCall[],
    tools: ChatCompletionToolCallable[],
    onProgress?: (token: string, status?: ChatResponseStatus, force?: boolean) => Promise<boolean | undefined>,
    mcpTokens?: MCPAuthToken[]
  ): Promise<
    {
      call: ChatCompletionToolCall;
      result: OpenAI.Chat.Completions.ChatCompletionMessageParam;
      stopped: boolean | undefined;
    }[]
  > {
    const requests = toolCalls.map(async call => {
      const tool = tools.find(t => t.name === call.name);
      if (!tool) {
        return {
          call,
          stopped: true,
          result: {
            role: "tool" as const,
            tool_call_id: call.callId,
            content: `Error: Unsupported tool: ${call.name}`,
          },
        };
      }

      if (!this.connection) {
        return {
          call,
          stopped: true,
          result: {
            role: "tool" as const,
            tool_call_id: call.callId,
            content: `Error: external service connection info is not provided.`,
          },
        };
      }

      const status = tool.status || ResponseStatus.TOOL_CALL;
      const detail = call.arguments ? JSON.stringify(call.arguments) : "";
      const stopped = await onProgress?.("", { status, detail });
      if (stopped) {
        return {
          call,
          result: {
            role: "tool" as const,
            tool_call_id: call.callId,
            content: "",
          },
          stopped,
        };
      }
      const result = await tool.call(call.arguments || {}, call.callId, this.connection, mcpTokens);
      return { call, result, stopped };
    });

    return Promise.all(requests);
  }
}
