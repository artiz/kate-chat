import {
  AIModelInfo,
  ApiProvider,
  InvokeModelParamsRequest,
  ModelResponse,
  ProviderInfo,
  StreamCallbacks,
  UsageCostInfo,
} from "../types/ai.types";
import { ConnectionParams } from "@/middleware/auth.middleware";

export abstract class BaseProviderService {
  protected connection: ConnectionParams;
  constructor(connection: ConnectionParams) {
    this.connection = connection;
  }

  abstract invokeModel(request: InvokeModelParamsRequest): Promise<ModelResponse>;
  abstract invokeModelAsync(inputRequest: InvokeModelParamsRequest, callbacks: StreamCallbacks): Promise<void>;
  abstract getCosts(startTime: number, endTime?: number): Promise<UsageCostInfo>;
  abstract getModels(): Promise<Record<string, AIModelInfo>>;
  abstract getInfo(checkConnection?: boolean): Promise<ProviderInfo>;

  static getApiProviderName(apiProvider: ApiProvider): string {
    switch (apiProvider) {
      case ApiProvider.OPEN_AI:
        return "OpenAI";
      case ApiProvider.AWS_BEDROCK:
        return "AWS Bedrock";
      case ApiProvider.YANDEX:
        return "Yandex";
      default:
        throw new Error(`Unsupported API provider: ${apiProvider}`);
    }
  }
}
