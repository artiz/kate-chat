import { InvokeModelCommand, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { InferenceType, ListFoundationModelsCommand, ModelModality } from "@aws-sdk/client-bedrock";
import { bedrockClient, bedrockManagementClient } from "../config/bedrock";
import { Message, MessageRole } from "../entities/Message";
import { Model } from "../entities/Model";
import { MessageFormat, StreamCallbacks, DEFAULT_MODEL_ID } from "../types/ai.types";

// Import provider-specific services
import { AnthropicService } from "./providers/anthropic.service";
import { AmazonService } from "./providers/amazon.service";
import { AI21Service } from "./providers/ai21.service";
import { CohereService } from "./providers/cohere.service";
import { MetaService } from "./providers/meta.service";
import { MistralService } from "./providers/mistral.service";

export { DEFAULT_MODEL_ID };

export class AIService {
  private anthropicService: AnthropicService;
  private amazonService: AmazonService;
  private ai21Service: AI21Service;
  private cohereService: CohereService;
  private metaService: MetaService;
  private mistralService: MistralService;

  constructor() {
    this.anthropicService = new AnthropicService();
    this.amazonService = new AmazonService();
    this.ai21Service = new AI21Service();
    this.cohereService = new CohereService();
    this.metaService = new MetaService();
    this.mistralService = new MistralService();
  }

  // Main method to interact with models
  async generateResponse(
    messages: MessageFormat[],
    modelId: string,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<string> {
    // Join user duplicate messages
    messages = this.preprocessMessages(messages);

    // Get provider service and parameters
    const { service, params } = await this.getProviderAndParams(messages, modelId, temperature, maxTokens);

    // Send command using Bedrock client
    const command = new InvokeModelCommand(params);
    const response = await bedrockClient.send(command);

    // Parse the response body
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return service.parseResponse(responseBody);
  }

  // Stream response from models using InvokeModelWithResponseStreamCommand
  async streamResponse(
    messages: MessageFormat[],
    modelId: string,
    callbacks: StreamCallbacks,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<void> {
    try {
      callbacks.onStart?.();

      // Preprocess messages
      messages = this.preprocessMessages(messages);

      // Check if modelId supports streaming (Anthropic, Amazon, Mistral)
      const supportsStreaming =
        modelId.startsWith("anthropic.") || modelId.startsWith("amazon.") || modelId.startsWith("mistral.");

      if (supportsStreaming) {
        // Get provider service and parameters
        const { service, params } = await this.getProviderAndParams(messages, modelId, temperature, maxTokens);

        // Create a streaming command
        const streamCommand = new InvokeModelWithResponseStreamCommand(params);
        const streamResponse = await bedrockClient.send(streamCommand);

        let fullResponse = "";

        // Process the stream
        if (streamResponse.body) {
          for await (const chunk of streamResponse.body) {
            if (chunk.chunk?.bytes) {
              const decodedChunk = new TextDecoder().decode(chunk.chunk.bytes);
              const chunkData = JSON.parse(decodedChunk);

              // Extract the token based on model provider
              let token = "";
              if (modelId.startsWith("anthropic.")) {
                // For Anthropic models
                if (chunkData.type === "content_block_delta" && chunkData.delta?.text) {
                  token = chunkData.delta.text;
                }
              } else if (modelId.startsWith("amazon.")) {
                // For Amazon models
                if (chunkData.outputText) {
                  token = chunkData.outputText;
                }
              } else if (modelId.startsWith("mistral.")) {
                // For Mistral models
                if (chunkData.outputs && chunkData.outputs[0]?.text) {
                  token = chunkData.outputs[0].text;
                }
              }

              if (token) {
                fullResponse += token;
                callbacks.onToken?.(token);
              }
            }
          }
        }

        callbacks.onComplete?.(fullResponse);
      } else {
        // For models that don't support streaming, use the regular generation and simulate streaming
        const fullResponse = await this.generateResponse(messages, modelId, temperature, maxTokens);

        // Simulate streaming by sending chunks of the response
        const chunks = fullResponse.split(" ");
        for (const chunk of chunks) {
          callbacks.onToken?.(chunk + " ");
          // Add a small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        callbacks.onComplete?.(fullResponse);
      }
    } catch (error) {
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
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

    console.log("Preprocess messages:", messages);

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

  // Get the appropriate service and parameters based on the model ID
  private async getProviderAndParams(
    messages: MessageFormat[],
    modelId: string,
    temperature: number,
    maxTokens: number
  ) {
    let service;
    let params;

    if (modelId.startsWith("anthropic.")) {
      const result = await this.anthropicService.generateResponse(messages, modelId, temperature, maxTokens);
      service = this.anthropicService;
      params = result.params;
    } else if (modelId.startsWith("amazon.")) {
      const result = await this.amazonService.generateResponse(messages, modelId, temperature, maxTokens);
      service = this.amazonService;
      params = result.params;
    } else if (modelId.startsWith("ai21.")) {
      const result = await this.ai21Service.generateResponse(messages, modelId, temperature, maxTokens);
      service = this.ai21Service;
      params = result.params;
    } else if (modelId.startsWith("cohere.")) {
      const result = await this.cohereService.generateResponse(messages, modelId, temperature, maxTokens);
      service = this.cohereService;
      params = result.params;
    } else if (modelId.startsWith("meta.")) {
      const result = await this.metaService.generateResponse(messages, modelId, temperature, maxTokens);
      service = this.metaService;
      params = result.params;
    } else if (modelId.startsWith("mistral.")) {
      const result = await this.mistralService.generateResponse(messages, modelId, temperature, maxTokens);
      service = this.mistralService;
      params = result.params;
    } else {
      throw new Error("Unsupported model provider");
    }

    return { service, params };
  }

  // Adapter method for message resolver
  async getCompletion(messages: Message[], model: Model): Promise<string> {
    // Convert DB message objects to MessageFormat structure
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.createdAt,
    }));

    // Use the existing generate method
    return this.generateResponse(formattedMessages, model.modelId || DEFAULT_MODEL_ID, 0.7, 2048);
  }

  // Helper method to get all supported models with their metadata
  static async getSupportedModels(): Promise<Record<string, any>> {
    // Get foundation model data from AWS Bedrock
    const command = new ListFoundationModelsCommand({});
    const response = await bedrockManagementClient.send(command);

    const models: Record<string, any> = {};

    if (response.modelSummaries && response.modelSummaries.length > 0) {
      for (const model of response.modelSummaries) {
        // skip image models for now
        if (model.outputModalities?.includes(ModelModality.IMAGE)) {
          continue;
        }

        if (model.modelId && model.providerName) {
          const modelId = model.modelId;
          const providerName = model.providerName;

          models[modelId] = {
            provider: providerName,
            name: model.modelName || modelId.split(".").pop() || modelId,
            description: `${model.modelName || modelId} by ${providerName}`,
            supportsStreaming: model.responseStreamingSupported || false,
            supportsTextIn: model.inputModalities?.includes(ModelModality.TEXT) ?? true,
            supportsTextOut: model.outputModalities?.includes(ModelModality.TEXT) ?? true,
            supportsImageIn: model.inputModalities?.includes(ModelModality.IMAGE) || false,
            supportsImageOut: model.outputModalities?.includes(ModelModality.IMAGE) || false,
            supportsEmbeddingsIn: model.outputModalities?.includes(ModelModality.EMBEDDING) || false,
          };
        }
      }
    }

    return models;
  }
}
