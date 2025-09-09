import OpenAI from "openai";
import {
  ModelMessage,
  ModelResponse,
  StreamCallbacks,
  InvokeModelParamsRequest,
  MessageMetadata,
  GetEmbeddingsRequest,
  EmbeddingsResponse,
} from "@/types/ai.types";
import { MessageRole } from "@/types/ai.types";
import { createLogger } from "@/utils/logger";
import { EmbeddingCreateParams } from "openai/resources/embeddings";
import { BaseChatProtocol } from "./base.protocol";

const logger = createLogger(__filename);

export class OpenAIProtocol implements BaseChatProtocol {
  private openai: OpenAI;

  constructor({ baseURL, apiKey }: { baseURL: string; apiKey: string }) {
    if (!apiKey) {
      logger.warn("API key is not defined.");
    }

    this.openai = new OpenAI({
      apiKey,
      baseURL,
      maxRetries: 10,
    });
  }

  get api(): OpenAI {
    return this.openai;
  }

  // Text generation for OpenAI proto
  // https://platform.openai.com/docs/guides/text?api-mode=chat
  formatMessages(
    modelId: string,
    messages: ModelMessage[],
    systemPrompt: string | undefined
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    // Format messages for OpenAI API
    const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages.map(msg => {
      const role = this.mapMessageRole(msg.role);

      if (typeof msg.body === "string") {
        return {
          role,
          content: msg.body,
        } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
      } else {
        const content = msg.body
          .filter(part => part.content)
          .map(part => {
            if (part.contentType === "text") {
              return { type: "text" as const, text: part.content };
            } else if (part.contentType === "image") {
              return {
                type: "image_url" as const,
                image_url: {
                  url: part.content,
                },
              };
            } else {
              logger.warn({ ...part }, `Unsupported message content type`);
              return null;
            }
          })
          .filter(Boolean);

        return {
          role,
          content,
        } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
      }
    });

    let systemRole: "system" | "developer" = "system";
    if (modelId.startsWith("o1") || modelId.startsWith("o4") || modelId.startsWith("gpt-5")) {
      systemRole = "developer";
    }

    if (systemPrompt) {
      result.unshift({
        role: systemRole,
        content: systemPrompt,
      });
    }

    return result;
  }

  formatModelRequest(
    inputRequest: InvokeModelParamsRequest
  ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
    const { systemPrompt, messages = [], modelId, temperature, maxTokens } = inputRequest;

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: modelId,
      messages: this.formatMessages(modelId, messages, systemPrompt),
      temperature,
      max_completion_tokens: maxTokens,
    };

    if (modelId.startsWith("o1") || modelId.startsWith("o4")) {
      delete params.temperature;
    } else if (modelId.startsWith("gpt-4o")) {
      delete params.temperature; // GPT-4o models do not support temperature
    } else if (modelId.startsWith("gpt-5")) {
      params.temperature = 1;
    }

    return params;
  }

  async invokeModel(inputRequest: InvokeModelParamsRequest): Promise<ModelResponse> {
    const params = this.formatModelRequest(inputRequest);
    logger.debug({ ...params, messages: [] }, "invoking chat.completions...");

    try {
      const response = await this.openai.chat.completions.create(params);
      logger.debug(response, "chat.completions response");

      const content = response.choices[0]?.message?.content || "";
      const usage = response.usage;

      return {
        type: "text",
        content,
        metadata: {
          usage: {
            inputTokens: usage?.prompt_tokens || 0,
            outputTokens: usage?.completion_tokens || 0,
            cacheReadInputTokens: usage?.prompt_tokens_details?.cached_tokens || 0,
          },
        },
      };
    } catch (error: unknown) {
      logger.error(error, "Error calling OpenAI API");
      if (error instanceof OpenAI.APIError) {
        throw new Error(`OpenAI API error: ${error.message}`);
      } else {
        throw error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  // Stream response from OpenAI models
  async invokeModelAsync(inputRequest: InvokeModelParamsRequest, callbacks: StreamCallbacks): Promise<void> {
    callbacks.onStart?.();

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      ...this.formatModelRequest(inputRequest),
      stream: true,
      stream_options: { include_usage: true },
    };

    logger.debug({ ...params, messages: [] }, "invoking streaming chat.completions...");

    try {
      const stream = await this.openai.chat.completions.create(params);
      let fullResponse = "";
      let meta: MessageMetadata | undefined = undefined;

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content || "";
        if (token) {
          fullResponse += token;
          callbacks.onToken?.(token);
        }

        const usage = chunk.usage;
        if (usage) {
          meta = {
            usage: {
              inputTokens: usage.prompt_tokens || 0,
              outputTokens: usage.completion_tokens || 0,
              cacheReadInputTokens: usage.prompt_tokens_details?.cached_tokens || 0,
            },
          };
        }
      }

      callbacks.onComplete?.(fullResponse, meta);
    } catch (error) {
      logger.warn(error, "streaming error");
      if (error instanceof OpenAI.APIError) {
        callbacks.onError?.(new Error(`OpenAI API error: ${error.message}`));
      } else {
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  async getEmbeddings(request: GetEmbeddingsRequest): Promise<EmbeddingsResponse> {
    const { modelId, input, dimensions } = request;
    const params: EmbeddingCreateParams = {
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
      logger.warn(error, "Error getting embeddings from OpenAI API");
      throw error;
    }
  }

  // Helper method to map our message roles to OpenAI roles
  private mapMessageRole(role: MessageRole): "user" | "assistant" | "developer" {
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
}
