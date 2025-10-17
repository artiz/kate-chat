import { Message } from "../../entities/Message";
import {
  AIModelInfo,
  EmbeddingsResponse,
  GetEmbeddingsRequest,
  CompleteChatRequest,
  MessageRole,
  ModelMessage,
  ModelResponse,
  MessageMetadata,
  ProviderInfo,
  UsageCostInfo,
  ChatResponseStatus,
} from "../../types/ai.types";
import { BedrockApiProvider } from "./providers/bedrock.provider";
import { OpenAIApiProvider } from "./providers/openai.provider";
import { YandexApiProvider } from "./providers/yandex.provider";
import { logger } from "../../utils/logger";
import { ApiProvider, ENABLED_API_PROVIDERS } from "@/config/ai/common";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { BaseApiProvider } from "./providers/base.provider";
import { FileContentLoader } from "../data";

export class AIService {
  // Main method to interact with models
  public async completeChat(
    connection: ConnectionParams,
    request: CompleteChatRequest,
    messages: Message[],
    fileLoader?: FileContentLoader
  ): Promise<ModelResponse> {
    return this.getApiProvider(request.apiProvider, connection, fileLoader).completeChat(
      request,
      this.formatMessages(messages || [])
    );
  }

  public async streamChatCompletion(
    connection: ConnectionParams,
    request: CompleteChatRequest,
    messages: Message[],
    callback: (
      data: { content?: string; error?: Error; metadata?: MessageMetadata; status?: ChatResponseStatus },
      completed?: boolean,
      force?: boolean
    ) => void,
    fileLoader?: FileContentLoader
  ) {
    // Stream the completion in background
    return this.getApiProvider(request.apiProvider, connection, fileLoader).streamChatCompletion(
      request,
      this.formatMessages(messages),
      {
        onStart: (status?: ChatResponseStatus) => {
          callback({ status });
        },
        onProgress: (token: string, status?: ChatResponseStatus, force?: boolean) => {
          callback({ content: token, status }, false, force);
        },
        onComplete: (response: string, metadata: MessageMetadata | undefined) => {
          callback({ content: response, metadata }, true);
        },
        onError: (error: Error) => {
          callback({ error }, true);
        },
      }
    );
  }

  // Main method to interact with models
  public async getEmbeddings(
    apiProvider: ApiProvider,
    connection: ConnectionParams,
    request: GetEmbeddingsRequest
  ): Promise<EmbeddingsResponse> {
    return this.getApiProvider(apiProvider, connection).getEmbeddings(request);
  }

  async getCosts(
    apiProvider: ApiProvider,
    connection: ConnectionParams,
    startTime: number,
    endTime: number | undefined
  ): Promise<UsageCostInfo> {
    const providerService = this.getApiProvider(apiProvider, connection);
    return providerService.getCosts(startTime, endTime);
  }

  // Get all models from all providers
  async getModels(connection: ConnectionParams): Promise<Record<string, AIModelInfo>> {
    const models = await Promise.all(
      ENABLED_API_PROVIDERS.map(async apiProvider => {
        const service = this.getApiProvider(apiProvider, connection);
        return await service.getModels();
      })
    );

    return models.reduce(
      (acc: Record<string, AIModelInfo>, models: Record<string, AIModelInfo>) => {
        return Object.assign(acc, models);
      },
      {} as Record<string, AIModelInfo>
    );
  }

  // Get provider information
  async getProviderInfo(connection: ConnectionParams, testConnection = false): Promise<ProviderInfo[]> {
    const providers: ProviderInfo[] = await Promise.all(
      ENABLED_API_PROVIDERS.map(async apiProvider => {
        try {
          const service = this.getApiProvider(apiProvider, connection);
          return service.getInfo(testConnection);
        } catch (error) {
          logger.error(error, `Error getting ${apiProvider} provider info`);
          return {
            id: apiProvider,
            name: BaseApiProvider.getApiProviderName(apiProvider),
            isConnected: false,
            details: { error: "Failed to get provider info" },
          };
        }
      })
    );

    logger.debug({ providers }, `Getting info for providers`);

    return providers;
  }

  /**
   * Get the appropriate API provider service instance.
   * @param apiProvider The API provider type.
   * @param connection The connection parameters.
   * @returns The API provider service instance.
   */
  protected getApiProvider(
    apiProvider: ApiProvider,
    connection: ConnectionParams,
    fileLoader?: FileContentLoader
  ): BaseApiProvider {
    if (!ENABLED_API_PROVIDERS.includes(apiProvider)) {
      throw new Error(`API provider ${apiProvider} is not enabled`);
    }

    if (apiProvider === ApiProvider.AWS_BEDROCK) {
      return new BedrockApiProvider(connection, fileLoader);
    } else if (apiProvider === ApiProvider.OPEN_AI) {
      return new OpenAIApiProvider(connection, fileLoader);
    } else if (apiProvider === ApiProvider.YANDEX_FM) {
      return new YandexApiProvider(connection, fileLoader);
    } else {
      throw new Error(`Unsupported API provider: ${apiProvider}`);
    }
  }

  /**
   * Format messages for model invocation and preprocess messages to join duplicates if they are
   * @param messages
   * @returns
   */
  private formatMessages(messages: Message[]): ModelMessage[] {
    const modelMessages = messages.map(msg => ({
      role: msg.role,
      body: msg.jsonContent || msg.content,
      timestamp: msg.createdAt,
      metadata: msg.metadata,
    }));

    modelMessages.sort((a, b) => {
      if (a.timestamp?.getTime() === b.timestamp?.getTime()) {
        return a.role === b.role ? 0 : a.role === MessageRole.USER ? -1 : 1;
      }

      return (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0);
    });

    return modelMessages.reduce((acc: ModelMessage[], msg: ModelMessage) => {
      const lastMessage = acc.length ? acc[acc.length - 1] : null;

      // Check if the last message is of the same role and content
      if (lastMessage && lastMessage.role === msg.role) {
        if (lastMessage.body === msg.body) {
          return acc;
        } else if (typeof lastMessage.body === "string" && typeof msg.body === "string") {
          lastMessage.body = (lastMessage.body + "\n" + msg.body).trimEnd();
        } else {
          lastMessage.body = Array.isArray(lastMessage.body)
            ? lastMessage.body
            : [{ content: lastMessage.body, contentType: "text" }];
          if (Array.isArray(msg.body)) {
            lastMessage.body.push(...msg.body);
          } else {
            lastMessage.body.push({ content: msg.body?.trimEnd(), contentType: "text" });
          }
        }
      } else if (msg.body?.length) {
        acc.push(msg);
      }

      return acc;
    }, []);
  }
}
