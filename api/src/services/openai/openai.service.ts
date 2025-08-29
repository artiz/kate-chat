import OpenAI from "openai";
import axios from "axios";
import {
  AIModelInfo,
  ApiProvider,
  ModelMessage,
  ModelResponse,
  ProviderInfo,
  StreamCallbacks,
  UsageCostInfo,
  ServiceCostInfo,
  InvokeModelParamsRequest,
  ModelResponseMetadata,
  ModelType,
  GetEmbeddingsRequest,
  EmbeddingsResponse,
} from "@/types/ai.types";
import { MessageRole } from "@/types/ai.types";
import { createLogger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/errors";
import { BaseProviderService } from "../base.provider";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { Agent } from "undici";
import { EmbeddingCreateParams } from "openai/resources/embeddings";
import { EMBEDDINGS_DIMENSIONS } from "@/config/ai";

const logger = createLogger(__filename);

const NON_CHAT_MODELS = [
  "gpt-3.5-turbo-instruct",
  "gpt-4o-audio",
  "gpt-4o-mini-audio",
  "gpt-4o-mini-realtime",
  "gpt-4o-realtime",
  "o1-pro",
];

const agent = new Agent({
  keepAliveTimeout: 30_000,
  connections: 100, // pool
});
const fetchOptions: Record<string, any> = {
  dispatcher: agent,
};

export interface OpenAICostResult {
  object: string;
  amount: {
    value: number;
    currency: string;
  };
  line_item: string | undefined;
  project_id: string | undefined;
  organization_id: string | undefined;
}

export interface OpenAICost {
  object: string;
  start_time: number;
  end_time: number;
  results: OpenAICostResult[];
}

export type OpenAIList<T> = {
  object: string;
  has_more?: boolean;
  next_page?: string;
  data: T[];
  usage?: {
    prompt_tokens?: number;
    total_tokens?: number;
  };
};

export class OpenAIService extends BaseProviderService {
  private openai: OpenAI;
  private openAiApiAdminKey: string;
  private baseUrl: string;

  constructor(connection: ConnectionParams) {
    super(connection);

    this.openAiApiAdminKey = connection.OPENAI_API_ADMIN_KEY || "";
    this.baseUrl = process.env.OPENAI_API_URL || "https://api.openai.com/v1";

    const openAiApiKey = connection.OPENAI_API_KEY || "";
    if (!openAiApiKey) {
      logger.warn("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
    }

    this.openai = new OpenAI({
      apiKey: openAiApiKey,
      baseURL: this.baseUrl,
    });
  }

  // Text generation with OpenAI models
  // https://platform.openai.com/docs/guides/text?api-mode=chat
  formatMessages(
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

    if (systemPrompt) {
      result.unshift({
        role: "developer",
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
      messages: this.formatMessages(messages, systemPrompt),
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
    if (!this.openai.apiKey) {
      throw new Error("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
    }

    const { modelId } = inputRequest;

    // Determine if this is an image generation request
    if (modelId.startsWith("dall-e")) {
      return this.generateImages(inputRequest);
    }

    const params = this.formatModelRequest(inputRequest);
    logger.debug({ ...params, messages: [] }, "Invoking OpenAI model");

    try {
      const response = await this.openai.chat.completions.create(params);

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
    if (!this.openai.apiKey) {
      callbacks.onError?.(new Error("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables."));
      return;
    }

    const { messages = [], modelId } = inputRequest;
    callbacks.onStart?.();

    // If this is an image generation model, generate the image non-streaming
    if (modelId === "dall-e-3" || modelId === "dall-e-2") {
      try {
        const response = await this.generateImages(inputRequest);
        callbacks.onComplete?.(response.content);
      } catch (error) {
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      ...this.formatModelRequest(inputRequest),
      stream: true,
      stream_options: { include_usage: true },
    };

    logger.debug({ ...params, messages: [] }, "Invoking OpenAI model streaming");

    try {
      const stream = await this.openai.chat.completions.create(params);
      let fullResponse = "";
      let meta: ModelResponseMetadata | undefined = undefined;

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
      logger.warn(error, "Error streaming from OpenAI API");
      if (error instanceof OpenAI.APIError) {
        callbacks.onError?.(new Error(`OpenAI API error: ${error.message}`));
      } else {
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  // Get OpenAI provider information including account details
  async getInfo(checkConnection = false): Promise<ProviderInfo> {
    const isConnected = !!this.openai.apiKey;
    const details: Record<string, string | number | boolean> = {
      apiUrl: this.baseUrl,
      configured: isConnected,
      credentialsValid: "N/A",
    };

    if (isConnected && checkConnection) {
      try {
        // Fetch models
        await this.openai.models.list();
        details.credentialsValid = true;
      } catch (error) {
        logger.warn(error, "Error fetching OpenAI models information");
        details.credentialsValid = false;
      }
    }

    return {
      id: ApiProvider.OPEN_AI,
      name: BaseProviderService.getApiProviderName(ApiProvider.OPEN_AI),
      costsInfoAvailable: !!this.openAiApiAdminKey,
      isConnected,
      details,
    };
  }

  async getCosts(startTime: number, endTime?: number): Promise<UsageCostInfo> {
    const result: UsageCostInfo = {
      start: new Date(startTime * 1000),
      end: endTime ? new Date(endTime * 1000) : undefined,
      costs: [],
    };
    if (!this.openAiApiAdminKey) {
      result.error = "OpenAI API admin key is not set. Set OPENAI_API_ADMIN_KEY in environment variables.";
      return result;
    }

    logger.debug(
      { start: new Date(startTime * 1000), end: endTime ? new Date(endTime * 1000) : undefined },
      "Fetching OpenAI usage costs"
    );

    const costsResults: OpenAICostResult[] = [];
    let pagesLimit = 10; // Limit to 10 pages to avoid excessive API calls
    try {
      let page: string | undefined = undefined;
      do {
        const response = await axios.get<OpenAIList<OpenAICost>>(`${this.baseUrl}/organization/costs`, {
          params: {
            start_time: startTime || undefined,
            end_time: endTime || undefined,
            group_by: "project_id",
            limit: 100,
            page,
          },
          headers: this.formatRestHeaders(),
          fetchOptions,
        });

        const res: OpenAIList<OpenAICost> = response.data;
        const costsData = res.data
          .filter(item => item.results?.length)
          .map(item => item.results)
          .flat();

        costsResults.push(...costsData);
        page = res.next_page;
      } while (page && pagesLimit-- > 0);
    } catch (error) {
      logger.error(error, "Error fetching OpenAI usage information");
      result.error = getErrorMessage(error);
      return result;
    }

    const costsPerProject = costsResults.reduce(
      (acc, item) => {
        const projectId = item.project_id || "unknown";
        const amount = item.amount?.value || 0;
        const currency = item.amount?.currency;

        if (currency) {
          if (!acc[projectId]) {
            acc[projectId] = { [currency]: amount };
          }
          acc[projectId][currency] = (acc[projectId][currency] || 0) + amount;
        }

        return acc;
      },
      {} as Record<string, Record<string, number>>
    );

    // Prepare costs details
    result.costs = Object.entries(costsPerProject).map(([projectId, amounts]) => {
      const serviceCostInfo: ServiceCostInfo = {
        name: projectId,
        type: "project",
        amounts: Object.entries(amounts).map(([currency, amount]) => ({
          amount,
          currency,
        })),
      };

      return serviceCostInfo;
    });

    return result;
  }

  async getModels(): Promise<Record<string, AIModelInfo>> {
    if (!this.openai) {
      logger.warn("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
      return {};
    }

    const models: Record<string, AIModelInfo> = {};

    try {
      // Fetch models from OpenAI API
      const response = await this.openai.models.list();

      // Filter and map models
      for (const model of response.data) {
        const nonChatModel = NON_CHAT_MODELS.some(prefix => model.id.startsWith(prefix));
        const embeddingModel = model.id.startsWith("text-embedding");
        const imageGeneration = model.id.startsWith("dall-e");
        const imageInput = model.id.startsWith("gpt-4.1") || model.id.startsWith("gpt-4o");

        if (nonChatModel && !imageGeneration && !embeddingModel) {
          continue; // Skip non-chat models that are not image generation or embeddings
        }

        const type = embeddingModel
          ? ModelType.EMBEDDING
          : imageGeneration
            ? ModelType.IMAGE_GENERATION
            : ModelType.CHAT;

        models[model.id] = {
          apiProvider: ApiProvider.OPEN_AI,
          provider: BaseProviderService.getApiProviderName(ApiProvider.OPEN_AI),
          name: this.getModelName(model.id),
          description: `${model.id} by OpenAI`,
          type,
          streaming: type === ModelType.CHAT,
          imageInput,
        };
      }

      // add "text-embedding-3-small" model if not returned by the API
      if (!models["text-embedding-3-small"]) {
        models["text-embedding-3-small"] = {
          apiProvider: ApiProvider.OPEN_AI,
          provider: "OpenAI",
          name: "Text Embedding 3 Small",
          description: "Text Embedding 3 Small by OpenAI",
          type: ModelType.EMBEDDING,
          streaming: false,
          imageInput: false,
        };
      }

      // Add DALL-E models manually if not returned by the API
      if (!models["dall-e-3"]) {
        models["dall-e-3"] = {
          apiProvider: ApiProvider.OPEN_AI,
          provider: "OpenAI",
          name: "DALL-E 3",
          description: "DALL-E 3 by OpenAI - Advanced image generation",
          type: ModelType.IMAGE_GENERATION,
          streaming: false,
          imageInput: false,
        };
      }

      if (!models["dall-e-2"]) {
        models["dall-e-2"] = {
          apiProvider: ApiProvider.OPEN_AI,
          provider: "OpenAI",
          name: "DALL-E 2",
          description: "DALL-E 2 by OpenAI - Image generation",
          type: ModelType.IMAGE_GENERATION,
          streaming: false,
          imageInput: false,
        };
      }
    } catch (error) {
      logger.error(error, "Error fetching OpenAI models");
    }

    return models;
  }

  async getEmbeddings(request: GetEmbeddingsRequest): Promise<EmbeddingsResponse> {
    if (!this.openai) {
      throw new Error("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
    }

    const { modelId, input } = request;
    const params: EmbeddingCreateParams = {
      model: modelId,
      input,
      encoding_format: "float",
      dimensions: modelId == "text-embedding-3-large" ? EMBEDDINGS_DIMENSIONS : undefined,
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
  // Image generation implementation for DALL-E models
  private async generateImages(inputRequest: InvokeModelParamsRequest): Promise<ModelResponse> {
    if (!this.openai.apiKey) {
      throw new Error("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
    }

    const { modelId, messages = [], imagesCount } = inputRequest;

    // Extract the prompt from the last user message
    const userMessages = messages.filter(msg => msg.role === MessageRole.USER);
    if (!userMessages.length) {
      throw new Error("No user prompt provided for image generation");
    }
    const lastUserMessage = userMessages[userMessages.length - 1].body;
    const prompt = Array.isArray(lastUserMessage)
      ? lastUserMessage
          .map(part => part.content)
          .join(" ")
          .trim()
      : lastUserMessage;

    if (!prompt) {
      throw new Error("Empty prompt provided for image generation");
    }

    const params: OpenAI.Images.ImageGenerateParams = {
      model: modelId,
      prompt,
      n: Math.min(imagesCount || 1, 10),
      size: "1024x1024",
      response_format: "b64_json",
    };

    logger.debug({ params }, "Image generation");
    try {
      const response = await this.openai.images.generate(params);
      if (!response.data?.length) {
        throw new Error("No image data returned from OpenAI API");
      }
      if (response.data.some(img => !img.b64_json)) {
        throw new Error("Invalid image data returned from OpenAI API");
      }

      return {
        type: "image",
        content: "",
        files: response.data.map(img => img.b64_json!),
      };
    } catch (error) {
      logger.warn(error, "Error generating image with OpenAI");
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

  private formatRestHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.openAiApiAdminKey}`,
    };
  }

  private getModelName(id: string): string {
    // for names like gpt-4-turbo return GPT-4 Turbo
    const name = id
      .replace("gpt", "GPT")
      .replace("dall-e", "DALL-E")
      .replace(/-/g, " ")
      .replace(/\b\w/g, char => char.toUpperCase());
    return name;
  }
}
