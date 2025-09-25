import OpenAI from "openai";
import {
  ModelMessage,
  ModelResponse,
  StreamCallbacks,
  CompleteChatRequest,
  MessageMetadata,
  GetEmbeddingsRequest,
  EmbeddingsResponse,
} from "@/types/ai.types";
import { MessageRole } from "@/types/ai.types";
import { createLogger } from "@/utils/logger";
import { EmbeddingCreateParams } from "openai/resources/embeddings";
import { BaseChatProtocol } from "./base.protocol";
import { response } from "express";
import { P } from "pino";
import { notEmpty } from "@/utils/assert";

const logger = createLogger(__filename);

export type OpenAIApiType = "completions" | "responses";

export class OpenAIProtocol implements BaseChatProtocol {
  private openai: OpenAI;
  private apiType: OpenAIApiType;

  constructor({
    baseURL,
    apiKey,
    apiType = "completions",
  }: {
    baseURL: string;
    apiKey: string;
    apiType?: OpenAIApiType;
  }) {
    if (!apiKey) {
      logger.warn("API key is not defined.");
    }

    this.apiType = apiType;
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

  formatCompletionRequest(
    inputRequest: CompleteChatRequest
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

  formatResponsesInput(messages: ModelMessage[]): OpenAI.Responses.ResponseInput {
    const result: OpenAI.Responses.ResponseInputItem[] = messages.map(msg => {
      const role = this.mapMessageRole(msg.role);

      if (typeof msg.body === "string") {
        return {
          role,
          content: msg.body,
        } as OpenAI.Responses.EasyInputMessage;
      } else {
        const content: OpenAI.Responses.ResponseInputContent[] = msg.body
          .filter(part => part.content)
          .map(part => {
            if (part.contentType === "text") {
              return { type: "input_text" as const, text: part.content };
            } else if (part.contentType === "image") {
              return {
                type: "input_image" as const,
                image_url: part.content,
                detail: "auto" as const,
              };
            } else {
              logger.warn({ ...part }, `Unsupported message content type`);
              return null;
            }
          })
          .filter(notEmpty);

        return {
          role,
          content,
        } as OpenAI.Responses.EasyInputMessage;
      }
    });

    return result;
  }

  async completeChat(inputRequest: CompleteChatRequest): Promise<ModelResponse> {
    try {
      const response: ModelResponse = {
        type: "text",
        content: "",
      };

      if (this.apiType === "responses") {
        const { modelId, messages = [], maxTokens, systemPrompt } = inputRequest;

        const params: OpenAI.Responses.ResponseCreateParams = {
          model: modelId,
          input: this.formatResponsesInput(messages),
          max_output_tokens: maxTokens,
          instructions: systemPrompt,
        };

        logger.debug({ ...params, messages: [] }, "invoking responses...");

        // TODO: extract to separate method
        type ResponseOutputItem = OpenAI.Responses.ResponseOutputText | OpenAI.Responses.ResponseOutputRefusal;
        const { usage, output } = await this.openai.responses.create(params);
        const { content, files } = output.reduce(
          (res, item) => {
            if (item.type === "message") {
              res.content += item.content
                .map((c: ResponseOutputItem) => (c.type === "output_text" ? c.text : c.refusal))
                .join("\n\n");
            } else if (item.type === "image_generation_call") {
              if (item.result) {
                res.files.push(item.result);
              } else {
                res.content += `|Image ${item.id}: ${item.status}|\n\n`;
              }
            }
            return res;
          },
          { content: "", files: [] as string[] }
        );

        response.content = content;
        response.metadata = {
          usage: {
            inputTokens: usage?.input_tokens || 0,
            outputTokens: usage?.output_tokens || 0,
            cacheReadInputTokens: usage?.input_tokens_details?.cached_tokens || 0,
          },
        };
      } else {
        const params = this.formatCompletionRequest(inputRequest);
        logger.debug({ ...params, messages: [] }, "invoking chat.completions...");

        const completion = await this.openai.chat.completions.create(params);
        logger.debug(completion, "chat.completions response");

        response.content = completion.choices[0]?.message?.content || "";

        const usage = completion.usage;
        response.metadata = {
          usage: {
            inputTokens: usage?.prompt_tokens || 0,
            outputTokens: usage?.completion_tokens || 0,
            cacheReadInputTokens: usage?.prompt_tokens_details?.cached_tokens || 0,
          },
        };
      }

      return response;
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
  async streamChatCompletion(inputRequest: CompleteChatRequest, callbacks: StreamCallbacks): Promise<void> {
    callbacks.onStart?.();

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      ...this.formatCompletionRequest(inputRequest),
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
