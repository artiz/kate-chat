import { ApiProvider, CredentialSourceType, ModelType } from "@/types/api";
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
  ModelMessageContent,
} from "@/types/ai.types";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { FileContentLoader } from "@/services/data/s3.service";
import { globalConfig } from "@/global-config";

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
  abstract getModels(allowedTypes: ModelType[], credSource: CredentialSourceType): Promise<Record<string, AIModelInfo>>;
  abstract getInfo(checkConnection?: boolean): Promise<ProviderInfo>;
  abstract stopRequest(requestId: string, modelId: string): Promise<void>;

  /**
   * Calculate input tokens for a message.
   * Uses charactersPerToken from global config for text, and OpenAI image token formula for images.
   */
  async calcInputTokens(message: ModelMessage, _modelId: string): Promise<number> {
    let totalTokens = 0;

    if (typeof message.body === "string") {
      // Text content: use characters per token ratio
      totalTokens = Math.ceil(message.body.length / globalConfig.ai.charactersPerToken);
    } else if (Array.isArray(message.body)) {
      // Mixed content: calculate tokens for each part
      for (const content of message.body) {
        totalTokens += this.calculateContentTokens(content);
      }
    }

    return totalTokens;
  }

  /**
   * Calculate output tokens for a response.
   * If usage is available from API response, uses it. Otherwise, estimates based on content length.
   */
  async calcOutputTokens(response: ModelResponse, _modelId: string): Promise<number> {
    // If usage is available from API response, use it
    if (response.metadata?.usage?.outputTokens) {
      return response.metadata.usage.outputTokens;
    }
    // Otherwise rough approximation based on characters per token ratio
    return Math.ceil((response.content || "").length / globalConfig.ai.charactersPerToken);
  }

  /**
   * Calculate tokens for a single content block
   */
  private calculateContentTokens(content: ModelMessageContent): number {
    if (content.contentType === "text") {
      // Text content: use characters per token ratio
      const textContent = content.content || "";
      return Math.ceil(textContent.length / globalConfig.ai.charactersPerToken);
    } else if (content.contentType === "image") {
      // Image content: use OpenAI image token formula
      // Base formula: floor((width / 85) * (height / 85) * 170)
      // If dimensions are in metadata, use them; otherwise use default estimate
      if (content.width && content.height) {
        return Math.floor((content.width / 85) * (content.height / 85) * 170);
      }
      // Default estimate for images (approximate 1024x1024): ~170 tokens
      // Conservative estimate when dimensions unknown
      return 170;
    } else if (content.contentType === "video") {
      // Video content: rough estimate
      // Videos are typically expensive, using base estimate
      return 500;
    }

    return 0;
  }

  static getApiProviderName(apiProvider: ApiProvider): string {
    switch (apiProvider) {
      case ApiProvider.AWS_BEDROCK:
        return "AWS Bedrock";
      case ApiProvider.OPEN_AI:
        return "OpenAI";
      case ApiProvider.YANDEX_AI:
        return "Yandex AI";
      case ApiProvider.CUSTOM_REST_API:
        return "Custom REST API";
      default:
        throw new Error(`Unsupported API provider: ${apiProvider}`);
    }
  }
}
