import { Agent } from "undici";
import {
  ApiProvider,
  InvokeModelParamsRequest,
  ModelResponse,
  ProviderInfo,
  StreamCallbacks,
  AIModelInfo,
  UsageCostInfo,
  ModelMessage,
  ModelType,
  EmbeddingsResponse,
  GetEmbeddingsRequest,
} from "@/types/ai.types";
import { YANDEX_FM_OPENAI_API_URL, YANDEX_MODELS } from "@/config/yandex";
import { BaseProviderService } from "../base.provider";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { BaseChatProtocol } from "../protocols/base.protocol";
import { OpenAIProtocol } from "../protocols/openai.protocol";

export class YandexService extends BaseProviderService {
  private apiKey: string;
  private folderId: string;
  private protocol: BaseChatProtocol;

  constructor(connection: ConnectionParams) {
    super(connection);
    this.apiKey = connection.YANDEX_FM_API_KEY || "";
    this.folderId = connection.YANDEX_FM_API_FOLDER || "";

    if (this.apiKey) {
      this.protocol = new OpenAIProtocol({
        baseURL: YANDEX_FM_OPENAI_API_URL,
        apiKey: this.apiKey,
      });
    }
  }

  // Invoke Yandex model for text generation
  async invokeModel(request: InvokeModelParamsRequest): Promise<ModelResponse> {
    if (!this.apiKey) {
      throw new Error("Yandex API key is not set. Set YANDEX_FM_API_KEY/YANDEX_FM_API_FOLDER in connection seettings.");
    }

    const { modelId } = request;
    const openAiRequest = {
      ...request,
      modelId: modelId.replace("{folder}", this.folderId ?? "default"),
    };

    return this.protocol.invokeModel(openAiRequest);
  }

  async invokeModelAsync(request: InvokeModelParamsRequest, callbacks: StreamCallbacks): Promise<void> {
    if (!this.apiKey || !this.folderId) {
      callbacks.onError?.(
        new Error("Yandex API key is not set. Set YANDEX_FM_API_KEY/YANDEX_FM_API_FOLDER in environment variables.")
      );
      return;
    }

    const { modelId } = request;
    const openAiRequest = {
      ...request,
      modelId: modelId.replace("{folder}", this.folderId ?? "default"),
    };

    return this.protocol.invokeModelAsync(openAiRequest, callbacks);
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
      name: BaseProviderService.getApiProviderName(ApiProvider.YANDEX_FM),
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

    return YANDEX_MODELS.reduce(
      (map, model) => {
        map[model.uri] = {
          apiProvider: ApiProvider.YANDEX_FM,
          provider: BaseProviderService.getApiProviderName(ApiProvider.YANDEX_FM),
          name: model.name,
          description: model.description || "",
          type: ModelType.CHAT,
          streaming: true,
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
}
