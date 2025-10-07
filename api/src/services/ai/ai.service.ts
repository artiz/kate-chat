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
  StreamCallbacks,
  UsageCostInfo,
  ChatResponseStatus,
} from "../../types/ai.types";
import { BedrockApiProvider } from "./providers/bedrock.provider";
import { OpenAIApiProvider } from "./providers/openai.provider";
import { YandexApiProvider } from "./providers/yandex.provider";
import { logger } from "../../utils/logger";
import {
  ApiProvider,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  DEFAULT_TOP_P,
  ENABLED_API_PROVIDERS,
} from "@/config/ai/common";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { BaseApiProvider } from "./providers/base.provider";

export class AIService {
  /**
   * Get the appropriate API provider service instance.
   * @param apiProvider The API provider type.
   * @param connection The connection parameters.
   * @returns The API provider service instance.
   */
  protected getApiProvider(apiProvider: ApiProvider, connection: ConnectionParams): BaseApiProvider {
    if (!ENABLED_API_PROVIDERS.includes(apiProvider)) {
      throw new Error(`API provider ${apiProvider} is not enabled`);
    }

    if (apiProvider === ApiProvider.AWS_BEDROCK) {
      return new BedrockApiProvider(connection);
    } else if (apiProvider === ApiProvider.OPEN_AI) {
      return new OpenAIApiProvider(connection);
    } else if (apiProvider === ApiProvider.YANDEX_FM) {
      return new YandexApiProvider(connection);
    } else {
      throw new Error(`Unsupported API provider: ${apiProvider}`);
    }
  }

  // Main method to interact with models
  async completeChat(
    apiProvider: ApiProvider,
    connection: ConnectionParams,
    inputRequest: CompleteChatRequest
  ): Promise<ModelResponse> {
    const request: CompleteChatRequest = {
      ...inputRequest,
      temperature: inputRequest.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: inputRequest.maxTokens ?? DEFAULT_MAX_TOKENS,
      topP: inputRequest.topP ?? DEFAULT_TOP_P,
      // Join user duplicate messages
      messages: this.preprocessMessages(inputRequest.messages || []),
    };

    const providerService = this.getApiProvider(apiProvider, connection);
    return providerService.completeChat(request);
  }

  // Stream response from models
  async streamChatCompletion(
    apiProvider: ApiProvider,
    connection: ConnectionParams,
    inputRequest: CompleteChatRequest,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const request: CompleteChatRequest = {
      ...inputRequest,
      temperature: inputRequest.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: inputRequest.maxTokens ?? DEFAULT_MAX_TOKENS,
      topP: inputRequest.topP ?? DEFAULT_TOP_P,

      messages: this.preprocessMessages(inputRequest.messages || []),
    };

    const providerService = this.getApiProvider(apiProvider, connection);
    return providerService.streamChatCompletion(request, callbacks);
  }

  // Main method to interact with models
  async getEmbeddings(
    apiProvider: ApiProvider,
    connection: ConnectionParams,
    request: GetEmbeddingsRequest
  ): Promise<EmbeddingsResponse> {
    const providerService = this.getApiProvider(apiProvider, connection);
    return providerService.getEmbeddings(request);
  }

  // Format messages for model invocation
  formatMessages(messages: Message[]): ModelMessage[] {
    return messages.map(msg => ({
      role: msg.role,
      body: msg.jsonContent || msg.content,
      timestamp: msg.updatedAt,
      metadata: msg.metadata,
    }));
  }

  // Adapter method for message resolver
  async getCompletion(
    apiProvider: ApiProvider,
    connection: ConnectionParams,
    request: CompleteChatRequest,
    messages: Message[]
  ): Promise<ModelResponse> {
    // Convert DB message objects to ModelMessage structure
    const formattedMessages = this.formatMessages(messages);

    // Invoke the model
    const response = await this.completeChat(apiProvider, connection, {
      ...request,
      messages: formattedMessages,
    });

    return response;
  }

  async streamCompletion(
    apiProvider: ApiProvider,
    connection: ConnectionParams,
    request: CompleteChatRequest,
    messages: Message[],
    callback: (
      data: { content?: string; error?: Error; metadata?: MessageMetadata; status?: ChatResponseStatus },
      completed?: boolean,
      force?: boolean
    ) => void
  ) {
    // Stream the completion in background
    return this.streamChatCompletion(
      apiProvider,
      connection,
      {
        ...request,
        messages: this.formatMessages(messages),
      },
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
   * Preprocess messages to join duplicates if they are
   * @param messages
   * @returns
   */
  private preprocessMessages(messages: ModelMessage[]): ModelMessage[] {
    messages.sort((a, b) => {
      if (a.timestamp?.getTime() === b.timestamp?.getTime()) {
        return a.role === b.role ? 0 : a.role === MessageRole.USER ? -1 : 1;
      }

      return (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0);
    });

    return messages.reduce((acc: ModelMessage[], msg: ModelMessage) => {
      const lastMessage = acc.length ? acc[acc.length - 1] : null;

      // Check if the last message is of the same role and content
      if (lastMessage && lastMessage.role === msg.role) {
        if (lastMessage.body === msg.body) {
          return acc;
        } else if (typeof lastMessage.body === "string" && typeof msg.body === "string") {
          lastMessage.body += "\n" + msg.body;
        } else {
          lastMessage.body = Array.isArray(lastMessage.body)
            ? lastMessage.body
            : [{ content: lastMessage.body, contentType: "text" }];
          if (Array.isArray(msg.body)) {
            lastMessage.body.push(...msg.body);
          } else {
            lastMessage.body.push({ content: msg.body, contentType: "text" });
          }
        }
      } else if (msg.body?.length) {
        acc.push(msg);
      }

      return acc;
    }, []);
  }
}
