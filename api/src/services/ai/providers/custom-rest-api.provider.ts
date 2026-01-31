import {
  AIModelInfo,
  ModelResponse,
  ProviderInfo,
  StreamCallbacks,
  UsageCostInfo,
  CompleteChatRequest,
  ModelType,
  GetEmbeddingsRequest,
  EmbeddingsResponse,
  ModelMessage,
  ModelFeature,
} from "@/types/ai.types";
import { createLogger } from "@/utils/logger";
import { BaseApiProvider } from "./base.provider";
import { ConnectionParams } from "@/middleware/auth.middleware";

import { ApiProvider } from "@/config/ai/common";
import { OpenAIProtocol, OpenAIApiType } from "../protocols/openai.protocol";
import { FileContentLoader } from "@/services/data";
import { Model } from "@/entities";
import { CustomModelProtocol } from "@/entities/Model";

const logger = createLogger(__filename);

export class CustomRestApiProvider extends BaseApiProvider {
  private protocol: OpenAIProtocol;
  private model: Model;
  private apiKey: string;
  private baseUrl: string;
  private modelName: string;
  private protocolType: CustomModelProtocol;

  constructor(connection: ConnectionParams, model: Model, fileLoader?: FileContentLoader) {
    super(connection, fileLoader);

    this.model = model;

    if (!model.customSettings) {
      throw new Error("Custom model settings are required for CUSTOM_REST_API provider");
    }

    this.apiKey = model.customSettings.apiKey || "";
    this.baseUrl = model.customSettings.endpoint || "";
    this.modelName = model.customSettings.modelName || model.modelId;
    this.protocolType = model.customSettings.protocol || CustomModelProtocol.OPENAI_CHAT_COMPLETIONS;

    if (!this.apiKey) {
      throw new Error("API key is required for custom REST API provider");
    }

    if (!this.baseUrl) {
      throw new Error("Endpoint URL is required for custom REST API provider");
    }

    // Initialize OpenAI protocol with custom endpoint
    this.protocol = new OpenAIProtocol({
      baseURL: this.baseUrl,
      apiKey: this.apiKey,
      connection,
      fileLoader,
    });
  }

  async completeChat(input: CompleteChatRequest, messages: ModelMessage[] = []): Promise<ModelResponse> {
    const apiType = this.getApiType();
    return this.protocol.completeChat(input, messages, apiType);
  }

  async streamChatCompletion(
    input: CompleteChatRequest,
    messages: ModelMessage[],
    callbacks: StreamCallbacks
  ): Promise<void> {
    const apiType = this.getApiType();
    return this.protocol.streamChatCompletion(input, messages, callbacks, apiType);
  }

  async getInfo(checkConnection = false): Promise<ProviderInfo> {
    const isConnected = !!this.apiKey && !!this.baseUrl;
    const details: Record<string, string | number | boolean> = {
      apiUrl: this.baseUrl,
      modelName: this.modelName,
      protocol: this.protocolType,
      configured: isConnected,
      credentialsValid: "N/A",
    };

    if (isConnected && checkConnection) {
      try {
        // Try to fetch models list to verify connection
        await this.protocol.api.models.list();
        details.credentialsValid = true;
      } catch (error) {
        logger.warn(error, "Error testing custom REST API connection");
        details.credentialsValid = false;
      }
    }

    return {
      id: ApiProvider.CUSTOM_REST_API,
      name: this.model.customSettings?.description || BaseApiProvider.getApiProviderName(ApiProvider.CUSTOM_REST_API),
      costsInfoAvailable: false,
      isConnected,
      details,
    };
  }

  async getCosts(startTime: number, endTime?: number): Promise<UsageCostInfo> {
    // Custom REST APIs typically don't provide cost information
    return {
      start: new Date(startTime * 1000),
      end: endTime ? new Date(endTime * 1000) : undefined,
      costs: [],
      error: "Cost information is not available for custom REST API providers",
    };
  }

  async getModels(): Promise<Record<string, AIModelInfo>> {
    const models: Record<string, AIModelInfo> = {};

    // For custom REST API, we return the configured model
    models[this.model.modelId] = {
      apiProvider: ApiProvider.CUSTOM_REST_API,
      provider: this.model.customSettings?.description || BaseApiProvider.getApiProviderName(ApiProvider.CUSTOM_REST_API),
      name: this.model.name,
      description: this.model.description || `${this.modelName} via Custom REST API`,
      type: this.model.type,
      streaming: this.model.streaming,
      imageInput: this.model.imageInput,
      maxInputTokens: this.model.maxInputTokens,
      tools: this.model.tools || [],
      features: this.model.features || [],
    };

    return models;
  }

  async getEmbeddings(request: GetEmbeddingsRequest): Promise<EmbeddingsResponse> {
    // Use OpenAI protocol for embeddings
    return this.protocol.getEmbeddings(request);
  }

  async stopRequest(requestId: string, modelId: string): Promise<void> {
    // Custom REST APIs might not support request cancellation
    logger.debug({ requestId, modelId }, "Stop request called for custom REST API (may not be supported)");
  }

  private getApiType(): OpenAIApiType {
    switch (this.protocolType) {
      case CustomModelProtocol.OPENAI_RESPONSES:
        return "responses";
      case CustomModelProtocol.OPENAI_CHAT_COMPLETIONS:
      default:
        return "chat";
    }
  }
}
