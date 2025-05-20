import { InvokeModelCommand, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";
import { bedrockClient, bedrockManagementClient, BEDROCK_MODEL_IDS } from "../config/bedrock";
import { MessageRole } from "../entities/Message";
import { ModelProvider as ModelProviderEntity } from "../entities/ModelProvider";
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
    return messages.reduce((acc: MessageFormat[], msg: MessageFormat) => {
      const lastMessage = acc[acc.length - 1];
      if (lastMessage && lastMessage.role === msg.role) {
        if (lastMessage.content === msg.content) {
          return acc;
        } else {
          lastMessage.content += "\n" + msg.content;
        }
      } else {
        acc.push({ ...msg });
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
  async getCompletion(messages: any[], model: Model): Promise<string> {
    // Convert DB message objects to MessageFormat structure
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    // Use the existing generate method
    return this.generateResponse(formattedMessages, model.modelId || DEFAULT_MODEL_ID, 0.7, 2048);
  }

  // Helper method to get all supported models
  static getSupportedModels() {
    // TODO: Fetch models from AWS Bedrock
    // For now, return the predefined list
    return BEDROCK_MODEL_IDS;
  }

  // Fetch model providers from AWS Bedrock
  static async getModelProviders(): Promise<ModelProviderEntity[]> {
    const providers: Map<string, ModelProviderEntity> = new Map();

    try {
      // Get real foundation model data from AWS Bedrock
      const command = new ListFoundationModelsCommand({});
      const response = await bedrockManagementClient.send(command);

      // Process the model list and extract providers
      if (response.modelSummaries && response.modelSummaries.length > 0) {
        for (const model of response.modelSummaries) {
          if (model.providerName) {
            const providerName = model.providerName;

            if (!providers.has(providerName)) {
              const provider = new ModelProviderEntity();
              provider.name = providerName;
              provider.description = `${providerName} models on AWS Bedrock`;
              provider.apiType = "bedrock";
              provider.isActive = true;

              providers.set(providerName, provider);
            }
          }
        }
      }

      // If no providers were found from the API (possibly due to permissions),
      // extract unique providers from our predefined model list
      if (providers.size === 0) {
        for (const [modelId, modelInfo] of Object.entries(BEDROCK_MODEL_IDS)) {
          if (!providers.has(modelInfo.provider)) {
            const provider = new ModelProviderEntity();
            provider.name = modelInfo.provider;
            provider.description = `${modelInfo.provider} models on AWS Bedrock`;
            provider.apiType = "bedrock";
            provider.isActive = true;

            providers.set(modelInfo.provider, provider);
          }
        }
      }

      return Array.from(providers.values());
    } catch (error) {
      console.error("Error fetching model providers from AWS Bedrock:", error);

      // Fallback to our predefined list of providers if API call fails
      const uniqueProviders = new Set(Object.values(BEDROCK_MODEL_IDS).map(model => model.provider));

      return Array.from(uniqueProviders).map(providerName => {
        const provider = new ModelProviderEntity();
        provider.name = providerName;
        provider.description = `${providerName} models on AWS Bedrock`;
        provider.apiType = "bedrock";
        provider.isActive = true;
        return provider;
      });
    }
  }
}
