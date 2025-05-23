import { InvokeModelCommand, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { ListFoundationModelsCommand, ModelModality } from "@aws-sdk/client-bedrock";
import { bedrockClient, bedrockManagementClient } from "../../config/bedrock";
import { AIModelInfo } from "../ai.service";
import { MessageFormat, ModelResponse, StreamCallbacks } from "../../types/ai.types";
import { ApiProvider } from "../../types/ai.types";
import BedrockModelConfigs from "../../config/data/bedrock-models-config.json";

interface BedrockModelConfigRecord {
  provider: string;
  modelId: string;
  modelIdOverride?: string;
  name: string;
  regions: string[];
}

export class BedrockService {
  async invokeModel(
    messages: MessageFormat[],
    modelId: string,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<ModelResponse> {
    // Get provider service and parameters
    const { service, params } = await this.formatProviderParams(messages, modelId, temperature, maxTokens);

    // Send command using Bedrock client
    const command = new InvokeModelCommand(params);
    const response = await bedrockClient.send(command);

    // Parse the response body
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return service.parseResponse(responseBody);
  }

  // Stream response from models using InvokeModelWithResponseStreamCommand
  async invokeModelAsync(
    messages: MessageFormat[],
    modelId: string,
    callbacks: StreamCallbacks,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<void> {
    try {
      callbacks.onStart?.();

      const provider = this.getModelProvider(modelId);

      // Check if modelId supports streaming (Anthropic, Amazon, Mistral)
      const supportsStreaming = provider === "anthropic" || provider === "amazon" || provider === "mistral";

      if (supportsStreaming) {
        // Get provider service and parameters
        const { service, params } = await this.formatProviderParams(messages, modelId, temperature, maxTokens);

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
              if (provider === "anthropic") {
                // For Anthropic models
                if (chunkData.type === "content_block_delta" && chunkData.delta?.text) {
                  token = chunkData.delta.text;
                }
              } else if (provider === "amazon") {
                // For Amazon models
                if (chunkData.outputText) {
                  token = chunkData.outputText;
                }
              } else if (provider === "mistral") {
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
        const response = await this.invokeModel(messages, modelId, temperature, maxTokens);

        // Simulate streaming by sending chunks of the response
        const chunks = response.content.split(" ");
        for (const chunk of chunks) {
          callbacks.onToken?.(chunk + " ");
          // Add a small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        callbacks.onComplete?.(response.content);
      }
    } catch (error) {
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Get the appropriate service and parameters based on the model ID
  private async formatProviderParams(
    messages: MessageFormat[],
    modelId: string,
    temperature: number,
    maxTokens: number
  ) {
    let service;
    let params;

    let provider = this.getModelProvider(modelId);

    if (provider == "anthropic") {
      const { AnthropicService } = await import("../providers/anthropic.service");
      const anthropicService = new AnthropicService();
      const result = await anthropicService.generateResponseParams(messages, modelId, temperature, maxTokens);
      service = anthropicService;
      params = result.params;
    } else if (provider == "amazon") {
      const { AmazonService } = await import("../providers/amazon.service");
      const amazonService = new AmazonService();
      const result = await amazonService.generateResponseParams(messages, modelId, temperature, maxTokens);
      service = amazonService;
      params = result.params;
    } else if (provider == "ai21") {
      const { AI21Service } = await import("../providers/ai21.service");
      const ai21Service = new AI21Service();
      const result = await ai21Service.generateResponseParams(messages, modelId, temperature, maxTokens);
      service = ai21Service;
      params = result.params;
    } else if (provider == "cohere") {
      const { CohereService } = await import("../providers/cohere.service");
      const cohereService = new CohereService();
      const result = await cohereService.generateResponseParams(messages, modelId, temperature, maxTokens);
      service = cohereService;
      params = result.params;
    } else if (provider == "meta") {
      const { MetaService } = await import("../providers/meta.service");
      const metaService = new MetaService();
      const result = await metaService.generateResponseParams(messages, modelId, temperature, maxTokens);
      service = metaService;
      params = result.params;
    } else if (provider == "mistral") {
      const { MistralService } = await import("../providers/mistral.service");
      const mistralService = new MistralService();
      const result = await mistralService.generateResponseParams(messages, modelId, temperature, maxTokens);
      service = mistralService;
      params = result.params;
    } else {
      throw new Error(`Unsupported model provider: ${provider}`);
    }

    return { service, params };
  }

  getModelProvider(modelId: string) {
    if (modelId.startsWith("us.amazon")) {
      return modelId.substring(3).split(".")[0];
    }

    return modelId.split(".")[0];
  }

  // Helper method to get all supported models with their metadata
  async getBedrockModels(): Promise<Record<string, AIModelInfo>> {
    // no AWS connection
    if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
      return {};
    }

    const modelsRegions = (BedrockModelConfigs as BedrockModelConfigRecord[]).reduce(
      (acc: Record<string, string[]>, region) => {
        const { modelId, regions } = region;
        acc[modelId] = regions;
        return acc;
      },
      {}
    );

    const modelIdOverrides = (BedrockModelConfigs as BedrockModelConfigRecord[]).reduce(
      (acc: Record<string, string>, region) => {
        const { modelId, modelIdOverride } = region;
        if (modelIdOverride) {
          acc[modelId] = modelIdOverride;
        }
        return acc;
      },
      {}
    );

    const command = new ListFoundationModelsCommand({});
    const response = await bedrockManagementClient.send(command);

    const models: Record<string, any> = {};

    if (!response.modelSummaries || !response.modelSummaries.length) {
      return models;
    }

    const bedrockRegion = await bedrockClient.config.region();
    for (const model of response.modelSummaries) {
      const regions = modelsRegions[model.modelId || model.modelArn || ""];
      if (!regions || !regions.includes(bedrockRegion)) {
        continue;
      }

      if (model.modelId && model.providerName) {
        const modelId = modelIdOverrides[model.modelId] || model.modelId;
        const providerName = model.providerName;

        models[modelId] = {
          apiProvider: ApiProvider.AWS_BEDROCK,
          provider: providerName,
          name: model.modelName || modelId.split(".").pop() || modelId,
          modelArn: model.modelArn,
          description: `${model.modelName || modelId} by ${providerName}`,
          supportsStreaming: model.responseStreamingSupported || false,
          supportsTextIn: model.inputModalities?.includes(ModelModality.TEXT) ?? true,
          supportsTextOut: model.outputModalities?.includes(ModelModality.TEXT) ?? true,
          supportsImageIn: model.inputModalities?.includes(ModelModality.IMAGE) || false,
          supportsImageOut: model.outputModalities?.includes(ModelModality.IMAGE) || false,
          supportsEmbeddingsIn: model.outputModalities?.includes(ModelModality.EMBEDDING) || false,
          currentRegion: process.env.AWS_REGION || "us-west-2",
        };
      }
    }

    return models;
  }
}
