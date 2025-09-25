import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { BedrockClient } from "@aws-sdk/client-bedrock";
import { InvokeModelCommand, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { ListFoundationModelsCommand, ModelModality } from "@aws-sdk/client-bedrock";
import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";

import {
  AIModelInfo,
  ModelResponse,
  StreamCallbacks,
  ProviderInfo,
  UsageCostInfo,
  ServiceCostInfo,
  CompleteChatRequest,
  MessageMetadata,
  ModelType,
  GetEmbeddingsRequest,
  EmbeddingsResponse,
} from "../../types/ai.types";
import { ApiProvider } from "../../types/ai.types";
import BedrockModelConfigs from "../../config/data/bedrock-models-config.json";
import { createLogger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/errors";
import { BaseProviderService } from "../base.provider";
import { AnthropicService, AmazonService, AI21Service, CohereService, MetaService, MistralService } from "./providers";
import { ConnectionParams } from "@/middleware/auth.middleware";

const logger = createLogger(__filename);

export type InvokeModelParams = {
  modelId: string;
  body: string;
};

export interface BedrockModelServiceProvider<T = unknown> {
  getInvokeModelParams(request: CompleteChatRequest): Promise<InvokeModelParams>;
  parseModelResponse(responseBody: T, request?: CompleteChatRequest): ModelResponse;
}

interface BedrockModelConfigRecord {
  provider: string;
  modelId: string;
  modelIdOverride?: Record<string, string>;
  name: string;
  regions: string[];
  maxInputTokens?: number;
}

export class BedrockService extends BaseProviderService {
  protected bedrockClient: BedrockRuntimeClient;
  protected bedrockManagementClient: BedrockClient;

  constructor(connection: ConnectionParams) {
    super(connection);

    if (!connection.AWS_BEDROCK_PROFILE && !connection.AWS_BEDROCK_ACCESS_KEY_ID) {
      logger.warn("AWS_BEDROCK_PROFILE/AWS_BEDROCK_ACCESS_KEY_ID is not set. Skipping AWS Bedrock initialization.");
      return;
    }

    const config = connection.AWS_BEDROCK_PROFILE
      ? {
          region: connection.AWS_BEDROCK_REGION,
          profile: connection.AWS_BEDROCK_PROFILE,
        } // Use AWS profile if set
      : {
          region: connection.AWS_BEDROCK_REGION,
          credentials: {
            accessKeyId: connection.AWS_BEDROCK_ACCESS_KEY_ID || "",
            secretAccessKey: connection.AWS_BEDROCK_SECRET_ACCESS_KEY || "",
          },
        };

    // AWS Bedrock client configuration
    this.bedrockClient = new BedrockRuntimeClient(config);

    // AWS Bedrock management client for non-runtime operations (listing models, etc.)
    this.bedrockManagementClient = new BedrockClient(config);
  }

  async completeChat(request: CompleteChatRequest): Promise<ModelResponse> {
    if (!this.bedrockClient) {
      throw new Error("AWS Bedrock client is not initialized. Please check your AWS credentials and region.");
    }

    // Get provider service and parameters
    const { service, params } = await this.formatProviderParams(request);

    // Send command using Bedrock client
    const command = new InvokeModelCommand(params);
    const response = await this.bedrockClient.send(command);

    // Parse the response body
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return service.parseModelResponse(responseBody, request);
  }

  // Stream response from models using InvokeModelWithResponseStreamCommand
  async streamChatCompletion(request: CompleteChatRequest, callbacks: StreamCallbacks): Promise<void> {
    if (!this.bedrockClient) {
      throw new Error("AWS Bedrock client is not initialized. Please check your AWS credentials and region.");
    }

    const { modelId } = request;
    callbacks.onStart?.();

    const provider = this.getModelProvider(modelId);

    // Check if modelId supports streaming (Anthropic, Amazon, Mistral)
    const supportsStreaming = provider === "anthropic" || provider === "amazon" || provider === "mistral";

    if (!supportsStreaming) {
      try {
        // For models that don't support streaming, use the regular generation and simulate streaming
        const response = await this.completeChat(request);

        // Simulate streaming by sending chunks of the response
        const chunks = response.content.split(" ");
        for (const chunk of chunks) {
          callbacks.onToken?.(chunk + " ");
          // Add a small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        callbacks.onComplete?.(response.content, response.metadata);
      } catch (e: unknown) {
        logger.error(e, "InvokeModel failed");
        callbacks.onError?.(e instanceof Error ? e : new Error(getErrorMessage(e)));
      }

      return;
    }

    try {
      // Get provider service and parameters
      const { params } = await this.formatProviderParams(request);

      // Create a streaming command
      const streamCommand = new InvokeModelWithResponseStreamCommand(params);
      const streamResponse = await this.bedrockClient.send(streamCommand);

      let fullResponse = "";
      let metadata: MessageMetadata | undefined = undefined;

      // Process the stream
      if (streamResponse.body) {
        for await (const chunk of streamResponse.body) {
          if (chunk.chunk?.bytes) {
            const decodedChunk = new TextDecoder().decode(chunk.chunk.bytes);

            let chunkData: any;
            try {
              chunkData = JSON.parse(decodedChunk);
            } catch (err) {
              logger.debug(err, `failed to parse chunk: ${decodedChunk}`);
              continue;
            }

            // Extract the token based on model provider
            let token = "";
            logger.trace(chunkData, "Сhunk received");

            // Anthropic models
            if (provider === "anthropic") {
              if (chunkData.type === "content_block_delta" && chunkData.delta?.text) {
                token = chunkData.delta.text;
              }
              // Amazon models
            } else if (provider === "amazon") {
              if (chunkData.outputText) {
                token = chunkData.outputText;
              } else if (chunkData.contentBlockDelta?.delta?.text) {
                token = chunkData.contentBlockDelta.delta.text;
              }

              if (chunkData.metadata?.usage) {
                const usage = chunkData.metadata.usage;
                metadata = {
                  usage: {
                    inputTokens: usage.inputTokens || usage.inputTokenCount,
                    outputTokens: usage.outputTokens || usage.outputTokenCount,
                    cacheReadInputTokens: usage.cacheReadInputTokenCount,
                    cacheWriteInputTokens: usage.cacheWriteInputTokenCount,
                  },
                };
              }

              // Mistral models
            } else if (provider === "mistral") {
              if (chunkData.outputs && chunkData.outputs[0]?.text) {
                token = chunkData.outputs[0].text;
              } else if (chunkData.choices && chunkData.choices[0]?.message?.content) {
                token = chunkData.choices[0].message.content;
              }
            } else {
              logger.warn(`Unsupported model provider: ${provider}. Cannot process streaming response.`);
            }
            if (chunkData.type === "message_stop" && !metadata && chunkData["amazon-bedrock-invocationMetrics"]) {
              const usage = chunkData["amazon-bedrock-invocationMetrics"];
              metadata = {
                usage: {
                  inputTokens: usage.inputTokenCount,
                  outputTokens: usage.outputTokenCount,
                  invocationLatency: usage.invocationLatency,
                },
              };
            }

            if (token) {
              fullResponse += token;
              callbacks.onToken?.(token);
            }
          }
        }
      }

      callbacks.onComplete?.(fullResponse, metadata);
    } catch (e: unknown) {
      logger.error(e, "InvokeModelWithResponseStreamCommand failed");
      callbacks.onError?.(e instanceof Error ? e : new Error(getErrorMessage(e)));
    }
  }

  // Get the appropriate service and parameters based on the model ID
  private async formatProviderParams(request: CompleteChatRequest) {
    const { modelId } = request;

    let service;
    let params;

    let provider = this.getModelProvider(modelId);

    if (provider == "anthropic") {
      const anthropicService = new AnthropicService();
      params = await anthropicService.getInvokeModelParams(request);
      service = anthropicService;
    } else if (provider == "amazon") {
      const amazonService = new AmazonService();
      params = await amazonService.getInvokeModelParams(request);
      service = amazonService;
    } else if (provider == "ai21") {
      const ai21Service = new AI21Service();
      params = await ai21Service.getInvokeModelParams(request);
      service = ai21Service;
    } else if (provider == "cohere") {
      const cohereService = new CohereService();
      params = await cohereService.getInvokeModelParams(request);
      service = cohereService;
    } else if (provider == "meta") {
      const metaService = new MetaService();
      params = await metaService.getInvokeModelParams(request);
      service = metaService;
    } else if (provider == "mistral") {
      const mistralService = new MistralService();
      params = await mistralService.getInvokeModelParams(request);
      service = mistralService;
    } else {
      throw new Error(`Unsupported model provider: ${provider}`);
    }

    return { service, params };
  }

  getModelProvider(modelId: string) {
    if (modelId.startsWith("us.") || modelId.startsWith("eu.") || modelId.startsWith("ap.")) {
      return modelId.substring(3).split(".")[0];
    }

    return modelId.split(".")[0];
  }

  async getInfo(checkConnection = false): Promise<ProviderInfo> {
    const isConnected = !!this.bedrockClient;
    const region = this.connection.AWS_BEDROCK_REGION;
    const profile = this.connection.AWS_BEDROCK_PROFILE;
    const accessKey = this.connection.AWS_BEDROCK_ACCESS_KEY_ID;

    const details: Record<string, string | number | boolean | undefined> = {
      credentialsValid: "N/A",
    };

    if (region) details.region = region;
    if (profile) details.profile = profile;
    if (accessKey) details.accessKey = `${accessKey.substring(0, 6)}...`;

    if (isConnected && checkConnection && this.bedrockManagementClient) {
      try {
        // Test credentials by attempting to make a simple API call
        const creds = await this.bedrockManagementClient.config.credentials();
        details.credentialsValid = true;
        if (creds.accountId) details.accountId = creds.accountId;
        if (creds.expiration) details.expiration = creds.expiration?.toISOString();
      } catch (error) {
        logger.error(error, "Error validating AWS credentials");
        details.credentialsValid = false;
        details.errorMessage = getErrorMessage(error);
      }
    }

    return {
      id: ApiProvider.AWS_BEDROCK,
      name: BaseProviderService.getApiProviderName(ApiProvider.AWS_BEDROCK),
      costsInfoAvailable: isConnected,
      isConnected,
      details,
    };
  }

  // Helper method to get all supported models with their metadata
  async getModels(): Promise<Record<string, AIModelInfo>> {
    // no AWS connection
    if (!this.connection.AWS_BEDROCK_ACCESS_KEY_ID && !this.connection.AWS_BEDROCK_PROFILE) {
      logger.warn("AWS credentials are not set. Skipping AWS Bedrock model retrieval.");
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

    const modelsInputTokens = (BedrockModelConfigs as BedrockModelConfigRecord[]).reduce(
      (acc: Record<string, number | undefined>, region) => {
        const { modelId, maxInputTokens } = region;
        acc[modelId] = maxInputTokens;
        return acc;
      },
      {}
    );

    const modelIdOverrides = (BedrockModelConfigs as BedrockModelConfigRecord[]).reduce(
      (acc: Record<string, Record<string, string>>, region) => {
        const { modelId, modelIdOverride } = region;
        if (modelIdOverride) {
          acc[modelId] = modelIdOverride;
        }
        return acc;
      },
      {}
    );

    const command = new ListFoundationModelsCommand({});
    const response = await this.bedrockManagementClient.send(command);

    const models: Record<string, AIModelInfo> = {};

    if (!response.modelSummaries || !response.modelSummaries.length) {
      return models;
    }

    const bedrockRegion = await this.bedrockClient.config.region();
    for (const model of response.modelSummaries) {
      const regions = modelsRegions[model.modelId || ""];
      if (!regions || !regions.includes(bedrockRegion)) {
        continue;
      }

      if (model.modelId && model.providerName) {
        let modelId = model.modelId;
        const providerName = model.providerName;

        if (modelIdOverrides[model.modelId]) {
          const map = modelIdOverrides[model.modelId];
          // Use the override if available
          const region = bedrockRegion.split("-")[0]; // Get the region prefix (e.g., "us")
          modelId = map[region] || map[modelId] || modelId;
        }

        const type = model.outputModalities?.includes(ModelModality.IMAGE)
          ? ModelType.IMAGE_GENERATION
          : model.outputModalities?.includes(ModelModality.EMBEDDING)
            ? ModelType.EMBEDDING
            : ModelType.CHAT;

        models[modelId] = {
          apiProvider: ApiProvider.AWS_BEDROCK,
          provider: providerName,
          name: model.modelName || modelId.split(".").pop() || modelId,
          description: `${model.modelName || modelId} by ${providerName}`,
          type,
          streaming: model.responseStreamingSupported || false,
          imageInput: model.inputModalities?.includes(ModelModality.IMAGE) || false,
          maxInputTokens: modelsInputTokens[model.modelId],
        };
      }
    }

    return models;
  }

  async getCosts(startTime: number, endTime?: number): Promise<UsageCostInfo> {
    const result: UsageCostInfo = {
      start: new Date(startTime * 1000),
      end: endTime ? new Date(endTime * 1000) : undefined,
      costs: [],
    };

    if (!this.connection.AWS_BEDROCK_ACCESS_KEY_ID && !this.connection.AWS_BEDROCK_PROFILE) {
      result.error =
        "AWS credentials are not set. Set AWS_BEDROCK_ACCESS_KEY_ID and AWS_BEDROCK_SECRET_ACCESS_KEY or AWS_BEDROCK_PROFILE in config.";
      return result;
    }

    try {
      // Create Cost Explorer client using the same region/credentials as Bedrock
      const costExplorerClient = new CostExplorerClient({
        region: this.connection.AWS_BEDROCK_REGION,
        credentials: await this.bedrockClient.config.credentials(),
      });

      // Format start and end dates in YYYY-MM-DD format required by Cost Explorer
      const startDate = new Date(startTime * 1000);
      const endDate = endTime ? new Date(endTime * 1000) : new Date();

      const formattedStartDate = startDate.toISOString().split("T")[0];
      const formattedEndDate = endDate.toISOString().split("T")[0];

      // Create command to get cost and usage data
      const command = new GetCostAndUsageCommand({
        TimePeriod: {
          Start: formattedStartDate,
          End: formattedEndDate,
        },
        Granularity: "DAILY",
        Metrics: ["BlendedCost", "UsageQuantity"],
        GroupBy: [
          {
            Type: "DIMENSION",
            Key: "SERVICE",
          },
        ],
      });

      logger.debug({ command }, "Fetching AWS Bedrock costs");

      // Get cost and usage data from AWS Cost Explorer
      const costData = await costExplorerClient.send(command);

      // Process the results into our required format
      const serviceCosts: ServiceCostInfo[] = [];

      // Overall AWS Bedrock cost
      let totalCost = 0;

      // Parse the results
      if (costData.ResultsByTime && costData.ResultsByTime.length > 0) {
        // If we have results, create service cost entries for each group
        for (const result of costData.ResultsByTime) {
          if (result.Groups && result.Groups.length > 0) {
            for (const group of result.Groups) {
              if (group.Metrics && group.Metrics.BlendedCost) {
                const cost = parseFloat(group.Metrics.BlendedCost.Amount || "0");
                totalCost += cost;

                // Extract service name
                const serviceName = group.Keys && group.Keys.length > 0 ? group.Keys[0] : "Amazon Bedrock";

                // Find or create the service cost entry
                let serviceCost = serviceCosts.find(sc => sc.name === serviceName);
                if (!serviceCost) {
                  serviceCost = {
                    name: serviceName,
                    type: "service",
                    amounts: [],
                  };
                  serviceCosts.push(serviceCost);
                }

                // Update or add the amount
                const currency = group.Metrics.BlendedCost.Unit || "USD";
                const existingAmount = serviceCost.amounts.find(a => a.currency === currency);
                if (existingAmount) {
                  existingAmount.amount += cost;
                } else {
                  serviceCost.amounts.push({ amount: cost, currency });
                }
              }
            }
          }
        }
      }

      // Get model specific costs using a more detailed query
      // This is a separate command to get costs grouped by model
      const modelCommand = new GetCostAndUsageCommand({
        TimePeriod: {
          Start: formattedStartDate,
          End: formattedEndDate,
        },
        Granularity: "DAILY",
        Metrics: ["BlendedCost", "UsageQuantity"],
        GroupBy: [
          {
            Type: "DIMENSION",
            Key: "USAGE_TYPE",
          },
        ],
        Filter: {
          Dimensions: {
            Key: "SERVICE",
            Values: ["Amazon Bedrock"],
          },
        },
      });

      const modelCostData = await costExplorerClient.send(modelCommand);

      // Process model-specific costs
      if (modelCostData.ResultsByTime && modelCostData.ResultsByTime.length > 0) {
        for (const result of modelCostData.ResultsByTime) {
          if (result.Groups && result.Groups.length > 0) {
            for (const group of result.Groups) {
              if (group.Metrics && group.Metrics.BlendedCost && group.Keys && group.Keys.length > 0) {
                // Parse usage type to determine model family
                const usageType = group.Keys[0];
                const cost = parseFloat(group.Metrics.BlendedCost.Amount || "0");
                const currency = group.Metrics.BlendedCost.Unit || "USD";

                // Extract model family from usage type
                let modelFamily = "Other Models";

                // Map usage types to model families
                if (usageType.includes("Claude")) {
                  modelFamily = "Anthropic Claude Models";
                } else if (usageType.includes("Titan")) {
                  modelFamily = "Amazon Titan Models";
                } else if (usageType.includes("Jurassic")) {
                  modelFamily = "AI21 Jurassic Models";
                } else if (usageType.includes("Command")) {
                  modelFamily = "Cohere Command Models";
                } else if (usageType.includes("Llama")) {
                  modelFamily = "Meta Llama Models";
                } else if (usageType.includes("Mistral")) {
                  modelFamily = "Mistral AI Models";
                }

                // Find or create the model family cost entry
                let modelCost = serviceCosts.find(sc => sc.name === modelFamily && sc.type === "model_family");
                if (!modelCost) {
                  modelCost = {
                    name: modelFamily,
                    type: "model_family",
                    amounts: [],
                  };
                  serviceCosts.push(modelCost);
                }

                // Update or add the amount
                const existingAmount = modelCost.amounts.find(a => a.currency === currency);
                if (existingAmount) {
                  existingAmount.amount += cost;
                } else {
                  modelCost.amounts.push({ amount: cost, currency });
                }
              }
            }
          }
        }
      }

      // If no detailed model costs were found, but we have total costs,
      // add a generic Amazon Bedrock service entry
      if (serviceCosts.length === 0 && totalCost > 0) {
        serviceCosts.push({
          name: "Amazon Bedrock",
          type: "service",
          amounts: [{ amount: totalCost, currency: "USD" }],
        });
      }

      result.costs = serviceCosts.sort((a, b) => a?.name?.localeCompare(b.name || "") || 0);
      return result;
    } catch (error) {
      logger.error(error, "Error fetching AWS Bedrock usage information");
      result.error = getErrorMessage(error);
      return result;
    }
  }

  async getEmbeddings(request: GetEmbeddingsRequest): Promise<EmbeddingsResponse> {
    // https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-runtime_example_bedrock-runtime_InvokeModelWithResponseStream_TitanTextEmbeddings_section.html
    if (!this.bedrockClient) {
      throw new Error("AWS Bedrock client is not initialized. Please check your AWS credentials and region.");
    }

    const params = {
      modelId: request.modelId,
      body: JSON.stringify({
        inputText: request.input,
      }),
    };

    // Send command using Bedrock client
    const command = new InvokeModelCommand(params);
    const response = await this.bedrockClient.send(command);

    // Parse the response body
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    return {
      embedding: responseBody.embedding || [],
      metadata: {
        usage: {
          inputTokens: responseBody.inputTextTokenCount || 0,
        },
      },
    };
  }
}
