import { Message, MessageRole } from "../entities/Message";
import { Model } from "../entities/Model";
import {
  AIModelInfo,
  ApiProvider,
  ModelMessageFormat,
  ModelResponse,
  ProviderInfo,
  StreamCallbacks,
} from "../types/ai.types";
import { BedrockService } from "./bedrock/bedrock.service";
import { OpenApiService } from "./openai/openai.service";
import { logger } from "../utils/logger";
export class AIService {
  private bedrockService: BedrockService;
  private openApiService: OpenApiService;

  constructor() {
    this.bedrockService = new BedrockService();
    this.openApiService = new OpenApiService();
  }

  // Main method to interact with models
  async invokeModel(
    messages: ModelMessageFormat[],
    modelId: string,
    apiProvider: ApiProvider,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<ModelResponse> {
    // Join user duplicate messages
    messages = this.preprocessMessages(messages);

    // Determine which API provider to use and invoke the appropriate service
    if (apiProvider === ApiProvider.AWS_BEDROCK) {
      return await this.bedrockService.invokeModel(messages, modelId, temperature, maxTokens);
    } else if (apiProvider === ApiProvider.OPEN_AI) {
      return await this.openApiService.invokeModel(messages, modelId, temperature, maxTokens);
    } else {
      throw new Error(`Unsupported API provider: ${apiProvider}`);
    }
  }

  // Stream response from models
  async invokeModelAsync(
    messages: ModelMessageFormat[],
    modelId: string,
    callbacks: StreamCallbacks,
    apiProvider: ApiProvider = ApiProvider.AWS_BEDROCK,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<void> {
    // Preprocess messages
    messages = this.preprocessMessages(messages);

    // Determine which API provider to use and invoke the appropriate service
    if (apiProvider === ApiProvider.AWS_BEDROCK) {
      return await this.bedrockService.invokeModelAsync(messages, modelId, callbacks, temperature, maxTokens);
    } else if (apiProvider === ApiProvider.OPEN_AI) {
      // Import OpenApiService dynamically to avoid circular dependencies
      const { OpenApiService } = await import("./openai/openai.service");
      const openApiService = new OpenApiService();
      return await openApiService.invokeModelAsync(messages, modelId, callbacks, temperature, maxTokens);
    } else {
      callbacks.onError?.(new Error(`Unsupported API provider: ${apiProvider}`));
    }
  }

  // Preprocess messages to join duplicates
  private preprocessMessages(messages: ModelMessageFormat[]): ModelMessageFormat[] {
    messages.sort((a, b) => {
      if (a.timestamp?.getTime() === b.timestamp?.getTime()) {
        return a.role === b.role ? 0 : a.role === MessageRole.USER ? -1 : 1;
      }

      return (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0);
    });

    return messages.reduce((acc: ModelMessageFormat[], msg: ModelMessageFormat) => {
      const lastMessage = acc.length ? acc[acc.length - 1] : null;
      // Check if the last message is of the same role and content
      if (lastMessage && lastMessage.role === msg.role) {
        if (lastMessage.content === msg.content) {
          return acc;
        } else {
          lastMessage.content += "\n" + msg.content;
        }
      } else {
        acc.push(msg);
      }

      return acc;
    }, []);
  }

  // Adapter method for message resolver
  async getCompletion(messages: Message[], model: Model): Promise<ModelResponse> {
    // Convert DB message objects to ModelMessageFormat structure
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.createdAt,
    }));

    // Invoke the model
    const response = await this.invokeModel(formattedMessages, model.modelId, model.apiProvider, 0.7, 2048);

    return response;
  }

  streamCompletion(
    messages: Message[],
    model: Model,
    callback: (token: string, completed?: boolean, error?: Error) => void
  ) {
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.createdAt,
    }));

    // Stream the completion in background
    this.invokeModelAsync(
      formattedMessages,
      model.modelId,
      {
        onToken: (token: string) => {
          callback(token);
          logger.debug({ token: token.substring(0, 50) }, "Token received");
        },
        onComplete: (response: string) => {
          callback(response, true);
        },
        onError: (error: Error) => {
          callback("", true, error);
          logger.error({ error }, "Error during streaming");
        },
      },
      model.apiProvider,
      0.7,
      2048
    );
  }

  // Get all models from all providers
  static async getModels(): Promise<Record<string, AIModelInfo>> {
    const models: Record<string, AIModelInfo> = {};

    // Get Bedrock models
    const bedrockService = new BedrockService();
    const bedrockModels = await bedrockService.getBedrockModels();
    Object.assign(models, bedrockModels);

    // Get OpenAI models
    const openAiService = new OpenApiService();
    const openAiModels = await openAiService.getOpenAIModels();
    Object.assign(models, openAiModels);

    return models;
  }

  // Get provider information
  static async getProviderInfo(): Promise<ProviderInfo[]> {
    const providers: ProviderInfo[] = [];

    // Get Bedrock provider info
    try {
      const bedrockService = new BedrockService();
      const bedrockInfo = await bedrockService.getBedrockInfo();
      providers.push(bedrockInfo);
    } catch (error) {
      logger.error(error, "Error getting Bedrock provider info");
      providers.push({
        id: ApiProvider.AWS_BEDROCK,
        name: "AWS Bedrock",
        isConnected: false,
        details: { error: "Failed to get provider info" },
      });
    }

    // Get OpenAI provider info
    try {
      const openAiService = new OpenApiService();
      const openAiInfo = await openAiService.getOpenAIInfo();
      providers.push(openAiInfo);
    } catch (error) {
      logger.error(error, "Error getting OpenAI provider info");
      providers.push({
        id: ApiProvider.OPEN_AI,
        name: "OpenAI",
        isConnected: false,
        details: { error: "Failed to get provider info" },
      });
    }

    return providers;
  }
}
