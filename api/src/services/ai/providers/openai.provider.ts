import OpenAI from "openai";
import { fetch, Agent } from "undici";
import {
  AIModelInfo,
  ModelResponse,
  StreamCallbacks,
  UsageCostInfo,
  ServiceCostInfo,
  CompleteChatRequest,
  GetEmbeddingsRequest,
  EmbeddingsResponse,
  ModelMessage,
  ProviderInfo,
} from "@/types/ai.types";
import { ApiProvider, MessageRole, ModelType, ToolType, ModelFeature } from "@/types/api";
import { createLogger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/errors";
import { BaseApiProvider } from "./base.provider";
import { ConnectionParams } from "@/middleware/auth.middleware";

import { globalConfig } from "@/global-config";
import { OpenAIApiType, OpenAIProtocol } from "../protocols/openai.protocol";
import {
  OPENAI_MODEL_MAX_INPUT_TOKENS,
  OPENAI_MODELS_IMAGES_GENERATION,
  OPENAI_MODELS_SUPPORT_IMAGES_INPUT,
  OPENAI_MODELS_SUPPORT_RESPONSES_API,
  OPENAI_MODELS_VIDEO_GENERATION,
  OPENAI_NON_CHAT_MODELS,
} from "@/config/ai/openai";
import { YandexWebSearch } from "@/services/ai/tools/yandex.web_search";
import { FileContentLoader } from "@/services/data";
import { notEmpty } from "@/utils/assert";
import { EMBEDDINGS_DIMENSIONS } from "@/entities/DocumentChunk";

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

  constructor(connection: ConnectionParams, fileLoader?: FileContentLoader, modelId?: string) {
    super(connection, fileLoader);

    this.adminApiKey = connection.openAiApiAdminKey || "";
    this.baseUrl = globalConfig.openai.apiUrl || "https://api.openai.com/v1";
    this.apiKey = connection.openAiApiKey || "";
    if (!this.apiKey) {
      logger.debug("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
    } else {
      this.protocol = new OpenAIProtocol({
        apiType: modelId ? this.getChatApiType(modelId) : "completions",
        baseURL: this.baseUrl,
        apiKey: this.apiKey,
        connection,
        fileLoader,
      });
    }
  }

  async completeChat(input: CompleteChatRequest, messages: ModelMessage[] = []): Promise<ModelResponse> {
    const { modelId, modelType } = input;

    // image generation request
    if (modelType === ModelType.IMAGE_GENERATION || modelId.startsWith("dall-e")) {
      return this.generateImages(input, messages);
    }

    return this.protocol.completeChat(input, messages);
  }

  // Stream response from OpenAI models
  async streamChatCompletion(
    input: CompleteChatRequest,
    messages: ModelMessage[],
    callbacks: StreamCallbacks
  ): Promise<void> {
    const { modelId, modelType } = input;

    // If this is an image generation model, generate the image non-streaming
    if (modelType === ModelType.IMAGE_GENERATION || modelId.startsWith("dall-e")) {
      callbacks.onStart();
      try {
        const response = await this.generateImages(input, messages);
        callbacks.onComplete(response);
      } catch (error) {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }

    return this.protocol.streamChatCompletion(input, messages, callbacks);
  }

  // Get OpenAI provider information including account details
  async getInfo(checkConnection = false): Promise<ProviderInfo> {
    let isConnected = !!this.apiKey;
    const details: Record<string, string | number | boolean> = {
      apiUrl: this.baseUrl,
    };

    if (isConnected && checkConnection) {
      try {
        // Fetch models
        await this.protocol.api.models.list();
        details.status = "OK";
      } catch (error) {
        logger.warn(error, "Error fetching OpenAI models information");
        details.status = `Connection check failed: ${getErrorMessage(error)}`;
        isConnected = false;
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

    if (!this.protocol?.api) {
      logger.debug("OpenAI API client is not initialized, cannot fetch models");
      return models;
    }

    logger.debug({ ignored: globalConfig.openai.ignoredModels }, "Fetching OpenAI models information");
    try {
      // Fetch models from OpenAI API
      const response = await this.protocol.api.models.list();
      const searchAvailable = await YandexWebSearch.isAvailable(this.connection);

      // Filter and map models
      for (const model of response.data) {
        if (globalConfig.openai.ignoredModels.some(ignoredModel => model.id.startsWith(ignoredModel))) {
          continue; // Skip ignored models
        }

        const nonChatModel = OPENAI_NON_CHAT_MODELS.some(prefix => model.id.startsWith(prefix));
        const embeddingModel = model.id.startsWith("text-embedding");
        const isImageGeneration = OPENAI_MODELS_IMAGES_GENERATION.some(prefix => model.id.startsWith(prefix));
        const isVideoGeneration = OPENAI_MODELS_VIDEO_GENERATION.some(prefix => model.id.startsWith(prefix));
        const isRealtime = model.id.includes("-realtime");
        const isTranscription = ["whisper"].some(prefix => model.id.startsWith(prefix));

        const imageInput = !!OPENAI_MODELS_SUPPORT_IMAGES_INPUT.find(prefix => model.id.startsWith(prefix));

        if (nonChatModel && !isImageGeneration && !embeddingModel) {
          continue; // Skip non-chat models that are not image generation or embeddings
        }

        const apiType = this.getChatApiType(model.id);
        const tools =
          embeddingModel || isImageGeneration || isVideoGeneration
            ? []
            : apiType === "responses"
              ? [ToolType.WEB_SEARCH, ToolType.CODE_INTERPRETER, ToolType.MCP]
              : [searchAvailable ? ToolType.WEB_SEARCH : null, ToolType.CODE_INTERPRETER, ToolType.MCP].filter(
                  notEmpty
                );

        const features: ModelFeature[] | undefined =
          apiType === "responses" ? [ModelFeature.REQUEST_CANCELLATION] : undefined;

        const type = embeddingModel
          ? ModelType.EMBEDDING
          : isImageGeneration
            ? ModelType.IMAGE_GENERATION
            : isVideoGeneration
              ? ModelType.VIDEO_GENERATION
              : isRealtime
                ? ModelType.REALTIME
                : isTranscription
                  ? ModelType.TRANSCRIPTION
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
          features,
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

  async stopRequest(requestId: string, modelId: string): Promise<void> {
    if (!this.protocol) {
      throw new Error("OpenAI protocol is not initialized");
    }

    const apiType = this.getChatApiType(modelId);

    if (apiType !== "responses") {
      throw new Error(`Request cancellation is only supported for OpenAI models using Responses API`);
    }

    try {
      await this.protocol.stopRequest(requestId);
    } catch (error) {
      logger.error(error, `OpenAI provider failed to stop request: ${requestId}`);
      throw error;
    }
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
          .map(part => (part.contentType === "text" ? part.content : ""))
          .join(" ")
          .trim()
      : lastUserMessage;

    if (!prompt) {
      throw new Error("Empty prompt provided for image generation");
    }

    let n = modelId === "dall-e-3" ? 1 : Math.min(imagesCount || 1, 10);

    const params: OpenAI.Images.ImageGenerateParams = {
      model: modelId,
      prompt,
      n,
      size: "1024x1024",
      response_format: ["dall-e-2", "dall-e-3"].includes(modelId) ? "b64_json" : undefined,
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
