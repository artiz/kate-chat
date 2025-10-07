import { ApiProvider } from "@/config/ai/common";
import {
  AIModelInfo,
  EmbeddingsResponse,
  GetEmbeddingsRequest,
  CompleteChatRequest,
  ModelResponse,
  ProviderInfo,
  StreamCallbacks,
  UsageCostInfo,
} from "../../../types/ai.types";
import { ConnectionParams } from "@/middleware/auth.middleware";

export abstract class BaseApiProvider {
  protected connection: ConnectionParams;
  constructor(connection: ConnectionParams) {
    this.connection = connection;
  }

  abstract completeChat(request: CompleteChatRequest): Promise<ModelResponse>;
  abstract streamChatCompletion(inputRequest: CompleteChatRequest, callbacks: StreamCallbacks): Promise<void>;
  abstract getEmbeddings(request: GetEmbeddingsRequest): Promise<EmbeddingsResponse>;

  abstract getCosts(startTime: number, endTime?: number): Promise<UsageCostInfo>;
  abstract getModels(): Promise<Record<string, AIModelInfo>>;
  abstract getInfo(checkConnection?: boolean): Promise<ProviderInfo>;

  static getApiProviderName(apiProvider: ApiProvider): string {
    switch (apiProvider) {
      case ApiProvider.AWS_BEDROCK:
        return "AWS Bedrock";
      case ApiProvider.OPEN_AI:
        return "OpenAI";
      case ApiProvider.YANDEX_FM:
        return "Yandex FM";
      default:
        throw new Error(`Unsupported API provider: ${apiProvider}`);
    }
  }
}
