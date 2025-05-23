import { Message, MessageRole } from "../entities/Message";
import { Model } from "../entities/Model";
import { ApiProvider, MessageFormat, ModelResponse, StreamCallbacks } from "../types/ai.types";
import { BedrockService } from "./bedrock/bedrock.service";
import { OpenApiService } from "./openai/openai.service";
export interface AIModelInfo {
  apiProvider: ApiProvider;
  provider: string;
  name: string;
  modelArn?: string;
  description: string;
  supportsStreaming: boolean;
  supportsTextIn: boolean;
  supportsTextOut: boolean;
  supportsImageIn: boolean;
  supportsImageOut: boolean;
  supportsEmbeddingsIn: boolean;
  currentRegion: string;
}

export class AIService {
  private bedrockService: BedrockService;

  constructor() {
    this.bedrockService = new BedrockService();
  }

  // Main method to interact with models
  async invokeModel(
    messages: MessageFormat[],
    modelId: string,
    apiProvider: ApiProvider,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<ModelResponse> {
    // Join user duplicate messages
    messages = this.preprocessMessages(messages);

    // Determine which API provider to use and invoke the appropriate service
    if (apiProvider === ApiProvider.AWS_BEDROCK) {
      return this.bedrockService.invokeModel(messages, modelId, temperature, maxTokens);
    } else if (apiProvider === ApiProvider.OPEN_AI) {
      // Import OpenApiService dynamically to avoid circular dependencies
      const { OpenApiService } = await import("./openai/openai.service");
      const openApiService = new OpenApiService();
      return openApiService.invokeModel(messages, modelId, temperature, maxTokens);
    } else {
      throw new Error(`Unsupported API provider: ${apiProvider}`);
    }
  }

  // Stream response from models
  async invokeModelAsync(
    messages: MessageFormat[],
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
      return this.bedrockService.invokeModelAsync(messages, modelId, callbacks, temperature, maxTokens);
    } else if (apiProvider === ApiProvider.OPEN_AI) {
      // Import OpenApiService dynamically to avoid circular dependencies
      const { OpenApiService } = await import("./openai/openai.service");
      const openApiService = new OpenApiService();
      return openApiService.invokeModelAsync(messages, modelId, callbacks, temperature, maxTokens);
    } else {
      callbacks.onError?.(new Error(`Unsupported API provider: ${apiProvider}`));
    }
  }

  // Preprocess messages to join duplicates
  private preprocessMessages(messages: MessageFormat[]): MessageFormat[] {
    messages.sort((a, b) => {
      if (a.timestamp?.getTime() === b.timestamp?.getTime()) {
        return a.role === b.role ? 0 : a.role === MessageRole.USER ? -1 : 1;
      }

      return (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0);
    });

    return messages.reduce((acc: MessageFormat[], msg: MessageFormat) => {
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
  async getCompletion(messages: Message[], model: Model): Promise<string> {
    // Convert DB message objects to MessageFormat structure
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.createdAt,
    }));

    // Invoke the model
    const response = await this.invokeModel(formattedMessages, model.modelId, model.apiProvider, 0.7, 2048);

    return response.content;
  }

  async streamCompletion(
    messages: Message[],
    model: Model,
    callback: (token: string, completed?: boolean, error?: Error) => void
  ) {
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.createdAt,
    }));

    // Stream the completion
    this.invokeModelAsync(
      formattedMessages,
      model.modelId,
      {
        onToken: (token: string) => {
          callback(token);
          console.log("Received token:", token);
        },
        onComplete: (response: string) => {
          callback(response, true);
          console.log("Streaming completed with response:", response);
        },
        onError: (error: Error) => {
          // Handle error
          callback("", true, error);
          console.error("Error during streaming:", error);
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

    // Get OpenAI models (to be implemented)
    const openAiService = new OpenApiService();
    const openAiModels = await openAiService.getOpenAIModels();
    Object.assign(models, openAiModels);

    return models;
  }
}
