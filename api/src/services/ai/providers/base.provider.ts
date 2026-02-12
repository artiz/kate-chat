import { ApiProvider } from "@/types/api";
import {
  AIModelInfo,
  EmbeddingsResponse,
  GetEmbeddingsRequest,
  CompleteChatRequest,
  ModelResponse,
  StreamCallbacks,
  UsageCostInfo,
  ModelMessage,
  ProviderInfo,
} from "@/types/ai.types";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { FileContentLoader } from "@/services/data/s3.service";

export abstract class BaseApiProvider {
  protected connection: ConnectionParams;
  protected fileLoader?: FileContentLoader;
  constructor(connection: ConnectionParams, fileLoader?: FileContentLoader) {
    this.connection = connection;
    this.fileLoader = fileLoader;
  }

  abstract completeChat(request: CompleteChatRequest, messages: ModelMessage[]): Promise<ModelResponse>;
  abstract streamChatCompletion(
    inputRequest: CompleteChatRequest,
    messages: ModelMessage[],
    callbacks: StreamCallbacks
  ): Promise<void>;
  abstract getEmbeddings(request: GetEmbeddingsRequest): Promise<EmbeddingsResponse>;

  abstract getCosts(startTime: number, endTime?: number): Promise<UsageCostInfo>;
  abstract getModels(): Promise<Record<string, AIModelInfo>>;
  abstract getInfo(checkConnection?: boolean): Promise<ProviderInfo>;
  abstract stopRequest(requestId: string, modelId: string): Promise<void>;

  static getApiProviderName(apiProvider: ApiProvider): string {
    switch (apiProvider) {
      case ApiProvider.AWS_BEDROCK:
        return "AWS Bedrock";
      case ApiProvider.OPEN_AI:
        return "OpenAI";
      case ApiProvider.YANDEX_FM:
        return "Yandex FM";
      case ApiProvider.CUSTOM_REST_API:
        return "Custom REST API";
      default:
        throw new Error(`Unsupported API provider: ${apiProvider}`);
    }
  }
}
