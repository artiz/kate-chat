import { Message, MessageRole } from "../entities/Message";
import { Model } from "../entities/Model";
import {
  AIModelInfo,
  ApiProvider,
  InvokeModelParamsRequest,
  ModelMessageFormat,
  ModelResponse,
  ProviderInfo,
  StreamCallbacks,
  UsageCostInfo,
} from "../types/ai.types";
import { BedrockService } from "./bedrock/bedrock.service";
import { OpenAIService } from "./openai/openai.service";
import { logger } from "../utils/logger";
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, DEFAULT_TOP_P } from "@/config/ai";
export class AIService {
  private bedrockService: BedrockService;
  private openAIService: OpenAIService;

  constructor() {
    this.bedrockService = new BedrockService();
    this.openAIService = new OpenAIService();
  }

  // Main method to interact with models
  async invokeModel(apiProvider: ApiProvider, inputRequest: InvokeModelParamsRequest): Promise<ModelResponse> {
    const request: InvokeModelParamsRequest = {
      ...inputRequest,

      temperature: inputRequest.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: inputRequest.maxTokens ?? DEFAULT_MAX_TOKENS,
      topP: inputRequest.topP ?? DEFAULT_TOP_P,

      // Join user duplicate messages
      messages: this.preprocessMessages(inputRequest.messages),
    };

    // Determine which API provider to use and invoke the appropriate service
    if (apiProvider === ApiProvider.AWS_BEDROCK) {
      return await this.bedrockService.invokeModel(request);
    } else if (apiProvider === ApiProvider.OPEN_AI) {
      return await this.openAIService.invokeModel(request);
    } else {
      throw new Error(`Unsupported API provider: ${apiProvider}`);
    }
  }

  // Stream response from models
  async invokeModelAsync(
    apiProvider: ApiProvider,
    inputRequest: InvokeModelParamsRequest,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const request: InvokeModelParamsRequest = {
      ...inputRequest,

      temperature: inputRequest.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: inputRequest.maxTokens ?? DEFAULT_MAX_TOKENS,
      topP: inputRequest.topP ?? DEFAULT_TOP_P,

      // Join user duplicate messages
      messages: this.preprocessMessages(inputRequest.messages),
    };

    // Determine which API provider to use and invoke the appropriate service
    if (apiProvider === ApiProvider.AWS_BEDROCK) {
      return await this.bedrockService.invokeModelAsync(request, callbacks);
    } else if (apiProvider === ApiProvider.OPEN_AI) {
      return await this.openAIService.invokeModelAsync(request, callbacks);
    } else {
      callbacks.onError?.(new Error(`Unsupported API provider: ${apiProvider}`));
    }
  }

  // Format messages for model invocation
  formatMessages(messages: Message[]): ModelMessageFormat[] {
    return messages.map(msg => ({
      role: msg.role,
      body: msg.jsonContent || msg.content,
      timestamp: msg.createdAt,
    }));
  }

  // Adapter method for message resolver
  async getCompletion(systemPrompt: string | undefined, messages: Message[], model: Model): Promise<ModelResponse> {
    // Convert DB message objects to ModelMessageFormat structure
    const formattedMessages = this.formatMessages(messages);

    // Invoke the model
    const response = await this.invokeModel(model.apiProvider, {
      systemPrompt,
      messages: formattedMessages,
      modelId: model.modelId,
    });

    return response;
  }

  streamCompletion(
    systemPrompt: string | undefined,
    messages: Message[],
    model: Model,
    callback: (token: string, completed?: boolean, error?: Error) => void
  ) {
    const formattedMessages = this.formatMessages(messages);

    // Stream the completion in background
    this.invokeModelAsync(
      model.apiProvider,
      {
        systemPrompt,
        messages: formattedMessages,
        modelId: model.modelId,
      },
      {
        onToken: (token: string) => {
          callback(token);
        },
        onComplete: (response: string) => {
          callback(response, true);
        },
        onError: (error: Error) => {
          callback("", true, error);
          logger.error({ error }, "Error during streaming");
        },
      }
    );
  }

  async getCosts(providerId: string, startTime: number, endTime: number | undefined): Promise<UsageCostInfo> {
    if (providerId === ApiProvider.OPEN_AI) {
      return this.openAIService.getCosts(startTime, endTime);
    } else if (providerId === ApiProvider.AWS_BEDROCK) {
      return this.bedrockService.getCosts(startTime, endTime);
    } else {
      throw new Error(`Unsupported provider: ${providerId}`);
    }
  }

  // Get all models from all providers
  async getModels(): Promise<Record<string, AIModelInfo>> {
    const models: Record<string, AIModelInfo> = {};

    // Get Bedrock models
    const bedrockModels = await this.bedrockService.getBedrockModels();
    Object.assign(models, bedrockModels);

    // Get OpenAI models
    const openAiModels = await this.openAIService.getOpenAIModels();
    Object.assign(models, openAiModels);

    return models;
  }

  // Get provider information
  async getProviderInfo(): Promise<ProviderInfo[]> {
    const providers: ProviderInfo[] = [];

    // Get Bedrock provider info
    try {
      providers.push(await this.bedrockService.getBedrockInfo());
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
      providers.push(await this.openAIService.getOpenAIInfo());
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
      } else {
        acc.push(msg);
      }

      return acc;
    }, []);
  }
}
