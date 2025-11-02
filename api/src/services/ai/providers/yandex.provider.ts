import {
  CompleteChatRequest,
  ModelResponse,
  ProviderInfo,
  StreamCallbacks,
  AIModelInfo,
  UsageCostInfo,
  ModelType,
  EmbeddingsResponse,
  GetEmbeddingsRequest,
  ToolType,
  ModelMessage,
} from "@/types/ai.types";
import { YANDEX_FM_OPENAI_API_URL, YANDEX_MODELS } from "@/config/ai/yandex";
import { BaseApiProvider } from "./base.provider";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { OpenAIProtocol } from "../protocols/openai.protocol";
import { YandexWebSearch } from "../tools/yandex.web_search";
import { ApiProvider } from "@/config/ai/common";
import { FileContentLoader } from "@/services/data/s3.service";

export class YandexApiProvider extends BaseApiProvider {
  private apiKey: string;
  private folderId: string;
  private protocol: OpenAIProtocol;

  constructor(connection: ConnectionParams, fileLoader?: FileContentLoader) {
    super(connection, fileLoader);
    this.apiKey = connection.YANDEX_FM_API_KEY || "";
    this.folderId = connection.YANDEX_FM_API_FOLDER || "";

    if (this.apiKey) {
      this.protocol = new OpenAIProtocol({
        baseURL: YANDEX_FM_OPENAI_API_URL,
        apiKey: this.apiKey,
        connection,
        fileLoader,
      });
    }
  }

  // Invoke Yandex model for text generation
  async completeChat(request: CompleteChatRequest, messages: ModelMessage[] = []): Promise<ModelResponse> {
    if (!this.apiKey) {
      throw new Error("Yandex API key is not set. Set YANDEX_FM_API_KEY/YANDEX_FM_API_FOLDER in connection settings.");
    }

    const { modelId } = request;
    const openAiRequest = {
      ...request,
      modelId: modelId.replace("{folder}", this.folderId ?? "default"),
    };

    return this.protocol.completeChat(openAiRequest, messages);
  }

  async streamChatCompletion(
    request: CompleteChatRequest,
    messages: ModelMessage[],
    callbacks: StreamCallbacks
  ): Promise<void> {
    if (!this.apiKey || !this.folderId) {
      callbacks.onError(
        new Error("Yandex API key is not set. Set YANDEX_FM_API_KEY/YANDEX_FM_API_FOLDER in environment variables.")
      );
      return;
    }

    const { modelId } = request;
    const openAiRequest = {
      ...request,
      modelId: modelId.replace("{folder}", this.folderId ?? "default"),
    };

    return this.protocol.streamChatCompletion(openAiRequest, messages, callbacks);
  }

  async getInfo(checkConnection = false): Promise<ProviderInfo> {
    const isConnected = !!this.apiKey;

    const details: Record<string, string | number | boolean | undefined> = {
      configured: isConnected,
      credentialsValid: "N/A",
      folderId: this.folderId || "N/A",
    };

    return {
      id: ApiProvider.YANDEX_FM,
      name: BaseApiProvider.getApiProviderName(ApiProvider.YANDEX_FM),
      isConnected,
      costsInfoAvailable: false, // Yandex doesn't support cost retrieval via API
      details,
    };
  }

  // Get available Yandex models
  async getModels(): Promise<Record<string, AIModelInfo>> {
    // If API key is not set, return empty object
    if (!this.apiKey) {
      return {};
    }

    const searchAvailable = await YandexWebSearch.isAvailable(this.connection);
    return YANDEX_MODELS.reduce(
      (map, model) => {
        map[model.uri] = {
          apiProvider: ApiProvider.YANDEX_FM,
          provider: BaseApiProvider.getApiProviderName(ApiProvider.YANDEX_FM),
          name: model.name,
          description: model.description || "",
          type: ModelType.CHAT,
          streaming: true,
          maxInputTokens: model.maxInputTokens,
          tools: searchAvailable ? [ToolType.WEB_SEARCH] : [],
        };

        return map;
      },
      {} as Record<string, AIModelInfo>
    );
  }

  // Costs are not available from Yandex API
  async getCosts(startTime: number, endTime?: number): Promise<UsageCostInfo> {
    return {
      start: new Date(startTime * 1000),
      end: endTime ? new Date(endTime * 1000) : undefined,
      error: "Cost information is not available from Yandex API",
      costs: [],
    };
  }

  async getEmbeddings(request: GetEmbeddingsRequest): Promise<EmbeddingsResponse> {
    throw new Error("Embeddings loading is not implemented.");
  }

  async stopRequest(requestId: string, modelId: string): Promise<void> {
    // Yandex FM does not support request cancellation
    throw new Error("Request cancellation is not supported by Yandex FM");
  }
}
