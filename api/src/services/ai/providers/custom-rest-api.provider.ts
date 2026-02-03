import {
  AIModelInfo,
  ModelResponse,
  ProviderInfo,
  StreamCallbacks,
  UsageCostInfo,
  CompleteChatRequest,
  GetEmbeddingsRequest,
  EmbeddingsResponse,
  ModelMessage,
} from "@/types/ai.types";
import { BaseApiProvider } from "./base.provider";
import { ConnectionParams } from "@/middleware/auth.middleware";

import { ApiProvider } from "@/config/ai/common";
import { OpenAIProtocol } from "../protocols/openai.protocol";
import { FileContentLoader } from "@/services/data";
import { Model } from "@/entities";
import { CustomModelProtocol, CustomModelSettings } from "@/entities/Model";
import { ModelProtocol } from "../protocols/common";
import { ok } from "assert";

export class CustomRestApiProvider extends BaseApiProvider {
  private model: Model;
  private modelSettings?: CustomModelSettings;
  private modelProtocol: CustomModelProtocol;

  constructor(connection: ConnectionParams, model?: Model, fileLoader?: FileContentLoader) {
    super(connection, fileLoader);

    if (model) {
      this.model = model;

      if (!model.customSettings) {
        throw new Error("Custom model settings are required for CUSTOM_REST_API provider");
      }

      const { endpoint, protocol } = model.customSettings;
      if (!protocol) {
        throw new Error("Custom model settings are required for CUSTOM_REST_API provider");
      }
      if (!endpoint) {
        throw new Error("Endpoint URL is required for custom REST API provider");
      }

      this.modelProtocol = protocol;
      this.modelSettings = model.customSettings;
    }
  }

  async completeChat(input: CompleteChatRequest, messages: ModelMessage[] = []): Promise<ModelResponse> {
    const protocol = this.getProtocol();
    return protocol.completeChat(input, messages);
  }

  async streamChatCompletion(
    input: CompleteChatRequest,
    messages: ModelMessage[],
    callbacks: StreamCallbacks
  ): Promise<void> {
    const protocol = this.getProtocol();

    return protocol.streamChatCompletion(input, messages, callbacks);
  }

  async getInfo(): Promise<ProviderInfo> {
    return {
      id: ApiProvider.CUSTOM_REST_API,
      name: BaseApiProvider.getApiProviderName(ApiProvider.CUSTOM_REST_API),
      costsInfoAvailable: false,
      isConnected: true,
      details: {},
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
    return models;
  }

  async getEmbeddings(request: GetEmbeddingsRequest): Promise<EmbeddingsResponse> {
    const protocol = this.getProtocol();
    return protocol.getEmbeddings(request);
  }

  async stopRequest(requestId: string, modelId: string): Promise<void> {
    const protocol = this.getProtocol();
    return protocol.stopRequest(requestId);
  }

  private getProtocol(): ModelProtocol {
    if (!this.model) {
      throw new Error("Model is not defined for CustomRestApiProvider");
    }

    const { endpoint, apiKey, modelName } = this.modelSettings!;
    ok(endpoint, "Endpoint is required in custom settings");
    ok(apiKey, "API key is required in custom settings");

    switch (this.modelProtocol) {
      case CustomModelProtocol.OPENAI_RESPONSES:
        return new OpenAIProtocol({
          apiType: "responses",
          baseURL: endpoint,
          apiKey: apiKey,
          modelIdOverride: modelName,
          connection: this.connection,
          fileLoader: this.fileLoader,
        });

      case CustomModelProtocol.OPENAI_CHAT_COMPLETIONS:
        return new OpenAIProtocol({
          apiType: "completions",
          baseURL: endpoint,
          apiKey: apiKey,
          modelIdOverride: modelName,
          connection: this.connection,
          fileLoader: this.fileLoader,
        });
      default:
        throw new Error(`Unsupported custom model protocol: ${this.modelProtocol}`);
    }
  }
}
