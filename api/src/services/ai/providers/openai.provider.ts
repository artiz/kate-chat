import OpenAI from "openai";
import { fetch, Agent } from "undici";
import {
  AIModelInfo,
  ModelResponse,
  ProviderInfo,
  StreamCallbacks,
  UsageCostInfo,
  ServiceCostInfo,
  CompleteChatRequest,
  ModelType,
  GetEmbeddingsRequest,
  EmbeddingsResponse,
  ToolType,
  ModelMessage,
} from "@/types/ai.types";
import { MessageRole } from "@/types/ai.types";
import { createLogger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/errors";
import { BaseApiProvider } from "./base.provider";
import { ConnectionParams } from "@/middleware/auth.middleware";

import { ApiProvider, EMBEDDINGS_DIMENSIONS } from "@/config/ai/common";
import { OpenAIApiType, OpenAIProtocol } from "../protocols/openai.protocol";
import {
  OPENAI_MODEL_MAX_INPUT_TOKENS,
  OPENAI_MODELS_SUPPORT_IMAGES_INPUT,
  OPENAI_MODELS_SUPPORT_RESPONSES_API,
  OPENAI_NON_CHAT_MODELS,
} from "@/config/ai/openai";
import { YandexWebSearch } from "../tools/yandex.web_search";

const logger = createLogger(__filename);

const dispatcher = new Agent({
  connectTimeout: 15_000,
  bodyTimeout: 15_000,
  keepAliveTimeout: 60_000,
  connections: 100, // pool
});

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

export class OpenAIApiProvider extends BaseApiProvider {
  private protocol: OpenAIProtocol;
  private apiKey: string;
  private adminApiKey: string;
  private baseUrl: string;

  constructor(connection: ConnectionParams) {
    super(connection);

    this.adminApiKey = connection.OPENAI_API_ADMIN_KEY || "";
    this.baseUrl = process.env.OPENAI_API_URL || "https://api.openai.com/v1";

    this.apiKey = connection.OPENAI_API_KEY || "";
    if (!this.apiKey) {
      logger.warn("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
    } else {
      this.protocol = new OpenAIProtocol({
        baseURL: this.baseUrl,
        apiKey: this.apiKey,
        connection,
      });
    }
  }

  async completeChat(input: CompleteChatRequest, messages: ModelMessage[] = []): Promise<ModelResponse> {
    const { modelId } = input;

    // image generation request
    if (modelId.startsWith("dall-e")) {
      return this.generateImages(input, messages);
    }

    return this.protocol.completeChat(input, messages, this.getChatApiType(modelId));
  }

  // Stream response from OpenAI models
  async streamChatCompletion(
    input: CompleteChatRequest,
    messages: ModelMessage[],
    callbacks: StreamCallbacks
  ): Promise<void> {
    const { modelId } = input;

    // If this is an image generation model, generate the image non-streaming
    if (modelId.startsWith("dall-e")) {
      callbacks.onStart?.();
      try {
        const response = await this.generateImages(input, messages);
        callbacks.onComplete?.(response.content);
      } catch (error) {
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }

    return this.protocol.streamChatCompletion(input, messages, callbacks, this.getChatApiType(modelId));
  }

  // Get OpenAI provider information including account details
  async getInfo(checkConnection = false): Promise<ProviderInfo> {
    const isConnected = !!this.apiKey;
    const details: Record<string, string | number | boolean> = {
      apiUrl: this.baseUrl,
      configured: isConnected,
      credentialsValid: "N/A",
    };

    if (isConnected && checkConnection) {
      try {
        // Fetch models
        await this.protocol.api.models.list();
        details.credentialsValid = true;
      } catch (error) {
        logger.warn(error, "Error fetching OpenAI models information");
        details.credentialsValid = false;
      }
    }

    return {
      id: ApiProvider.OPEN_AI,
      name: BaseApiProvider.getApiProviderName(ApiProvider.OPEN_AI),
      costsInfoAvailable: !!this.adminApiKey,
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
    if (!this.adminApiKey) {
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
        const params = new URLSearchParams({
          group_by: "project_id",
          limit: "100",
        });

        if (startTime) {
          params.append("start_time", String(startTime));
        }
        if (endTime) {
          params.append("end_time", String(endTime));
        }
        if (page) {
          params.append("page", page);
        }

        const response: OpenAIList<OpenAICost> = await fetch(
          `${this.baseUrl}/organization/costs?${params.toString()}`,
          {
            method: "GET",
            headers: this.formatRestHeaders(),
            dispatcher,
          }
        ).then(res => res.json() as Promise<OpenAIList<OpenAICost>>);

        const costsData = response.data
          .filter(item => item.results?.length)
          .map(item => item.results)
          .flat();

        costsResults.push(...costsData);
        page = response.next_page;
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
    const models: Record<string, AIModelInfo> = {};

    try {
      // Fetch models from OpenAI API
      const response = await this.protocol.api.models.list();
      const searchAvailable = await YandexWebSearch.isAvailable(this.connection);

      // Filter and map models
      for (const model of response.data) {
        const nonChatModel = OPENAI_NON_CHAT_MODELS.some(prefix => model.id.startsWith(prefix));
        const embeddingModel = model.id.startsWith("text-embedding");
        const imageGeneration = model.id.startsWith("dall-e");
        const imageInput = !!OPENAI_MODELS_SUPPORT_IMAGES_INPUT.find(prefix => model.id.startsWith(prefix));

        if (nonChatModel && !imageGeneration && !embeddingModel) {
          continue; // Skip non-chat models that are not image generation or embeddings
        }

        const apiType = this.getChatApiType(model.id);
        const tools =
          embeddingModel || imageGeneration
            ? []
            : apiType === "responses"
              ? [ToolType.WEB_SEARCH, ToolType.CODE_INTERPRETER]
              : searchAvailable
                ? [ToolType.WEB_SEARCH]
                : [];

        const type = embeddingModel
          ? ModelType.EMBEDDING
          : imageGeneration
            ? ModelType.IMAGE_GENERATION
            : ModelType.CHAT;

        const maxInputTokens =
          OPENAI_MODEL_MAX_INPUT_TOKENS[model.id] ||
          Object.entries(OPENAI_MODEL_MAX_INPUT_TOKENS).find(([key]) => model.id.startsWith(key))?.[1] ||
          undefined;

        models[model.id] = {
          apiProvider: ApiProvider.OPEN_AI,
          provider: BaseApiProvider.getApiProviderName(ApiProvider.OPEN_AI),
          name: this.getModelName(model.id),
          description: `${model.id} by OpenAI`,
          type,
          streaming: type === ModelType.CHAT,
          imageInput,
          maxInputTokens,
          tools,
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
    const { modelId } = request;
    return this.protocol.getEmbeddings({
      ...request,
      dimensions: modelId == "text-embedding-3-large" ? EMBEDDINGS_DIMENSIONS : undefined,
    });
  }

  // Image generation implementation for DALL-E models
  private async generateImages(
    inputRequest: CompleteChatRequest,
    messages: ModelMessage[] = []
  ): Promise<ModelResponse> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
    }

    const { modelId, imagesCount } = inputRequest;

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
      const response = await this.protocol.api.images.generate(params);
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

  private formatRestHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json; charset=utf-8",
      Authorization: `Bearer ${this.adminApiKey}`,
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

  private getChatApiType(modelId: string): OpenAIApiType {
    return OPENAI_MODELS_SUPPORT_RESPONSES_API.includes(modelId) ||
      OPENAI_MODELS_SUPPORT_RESPONSES_API.some((prefix: string) => modelId.startsWith(prefix))
      ? "responses"
      : "completions";
  }
}
