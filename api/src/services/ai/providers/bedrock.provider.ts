import {
  BedrockRuntimeClient,
  ContentBlock,
  ConverseCommand,
  InvokeModelCommand,
  ConverseCommandInput,
  ConverseCommandOutput,
  ConverseStreamCommand,
  ImageFormat,
  VideoFormat,
  Message as ConverseMessage,
} from "@aws-sdk/client-bedrock-runtime";
import { BedrockClient, ListFoundationModelsCommand, ModelModality } from "@aws-sdk/client-bedrock";
import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";

import {
  ApiProvider,
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
  MessageRole,
  ResponseStatus,
  ToolType,
} from "@/types/ai.types";
import BedrockModelConfigs from "@/config/data/bedrock-models-config.json";
import { createLogger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/errors";
import { BaseApiProvider } from "./base.provider";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { notEmpty } from "@/utils/assert";
import { YandexWebSearch } from "../tools/yandex.web_search";

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

export class BedrockApiProvider extends BaseApiProvider {
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
    const input = this.formatConverseParams(request);
    const command = new ConverseCommand(input);
    const response = await this.bedrockClient.send(command);
    return this.parseConverseResponse(response, request);
  }

  // Stream response from models using InvokeModelWithResponseStreamCommand
  async streamChatCompletion(request: CompleteChatRequest, callbacks: StreamCallbacks): Promise<void> {
    if (!this.bedrockClient) {
      const err = new Error("AWS Bedrock client is not initialized. Please check your AWS credentials and region.");
      if (callbacks.onError) {
        callbacks.onError(err);
      } else {
        throw err;
      }
      return;
    }

    callbacks.onStart?.();

    try {
      const input = this.formatConverseParams(request);
      const command = new ConverseStreamCommand(input);
      const streamResponse = await this.bedrockClient.send(command);

      let fullResponse = "";
      let reasoningContent = "";
      let metadata: MessageMetadata | undefined = undefined;

      // Process the stream
      if (!streamResponse.stream) {
        callbacks.onComplete?.("_No response_");
        return;
      }

      for await (const chunk of streamResponse.stream) {
        if (chunk.metadata?.usage) {
          const { usage, metrics } = chunk.metadata;
          metadata = {
            usage: {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              cacheReadInputTokens: usage.cacheReadInputTokens,
              cacheWriteInputTokens: usage.cacheWriteInputTokens,
              invocationLatency: metrics?.latencyMs,
            },
          };
        }

        if (chunk.contentBlockDelta?.delta) {
          const delta = chunk.contentBlockDelta.delta;
          if (delta.text) {
            fullResponse += delta.text;
            callbacks.onProgress?.(delta.text);
          } else if (delta.reasoningContent) {
            reasoningContent += delta.reasoningContent;
            callbacks.onProgress?.("", { status: ResponseStatus.REASONING, detail: reasoningContent });
          }
        }

        if (chunk.internalServerException) {
          callbacks.onError?.(chunk.internalServerException);
        } else if (chunk.modelStreamErrorException) {
          callbacks.onError?.(chunk.modelStreamErrorException);
        } else if (chunk.validationException) {
          callbacks.onError?.(chunk.validationException);
          // TODO: add retry
        } else if (chunk.throttlingException) {
          callbacks.onError?.(chunk.throttlingException);
        } else if (chunk.serviceUnavailableException) {
          callbacks.onError?.(chunk.serviceUnavailableException);
        }
      }

      callbacks.onComplete?.(fullResponse, metadata);
    } catch (e: unknown) {
      logger.error(e, "InvokeModelWithResponseStreamCommand failed");
      callbacks.onError?.(e instanceof Error ? e : new Error(getErrorMessage(e)));
    }
  }

  public async getInfo(checkConnection = false): Promise<ProviderInfo> {
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
      name: BaseApiProvider.getApiProviderName(ApiProvider.AWS_BEDROCK),
      costsInfoAvailable: isConnected,
      isConnected,
      details,
    };
  }

  // Helper method to get all supported models with their metadata
  public async getModels(): Promise<Record<string, AIModelInfo>> {
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

    const searchAvailable = await YandexWebSearch.isAvailable(this.connection);
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
          tools: searchAvailable ? [ToolType.WEB_SEARCH] : undefined,
        };
      }
    }

    return models;
  }

  public async getCosts(startTime: number, endTime?: number): Promise<UsageCostInfo> {
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

      logger.trace({ command }, "Fetching AWS Bedrock costs");

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

  public async getEmbeddings(request: GetEmbeddingsRequest): Promise<EmbeddingsResponse> {
    // https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-runtime_example_bedrock-runtime_InvokeModelWithResponseStream_TitanTextEmbeddings_section.html
    if (!this.bedrockClient) {
      throw new Error("AWS Bedrock client is not initialized. Please check your AWS credentials and region.");
    }

    const { modelId } = request;
    const isV2 = modelId.includes("embed-text-v2");

    // TODO: add cohere.embed-multilingual-v3 support
    const params = {
      modelId: request.modelId,
      body: JSON.stringify({
        inputText: request.input,
        dimensions: isV2 ? request.dimensions : undefined,
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

  private formatConverseParams(request: CompleteChatRequest): ConverseCommandInput {
    const { systemPrompt, messages = [], modelId, temperature, maxTokens, topP } = request;

    const requestMessages: ConverseMessage[] = messages.map(msg => {
      if (typeof msg.body === "string") {
        return {
          role: msg.role === MessageRole.ASSISTANT ? "assistant" : "user",
          content: [{ text: msg.body }],
        };
      }

      const content: ContentBlock[] = msg.body
        .map(m => {
          if (m.contentType === "image" || m.contentType === "video") {
            // input format "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABv..."
            let base64Data = m.content;
            let mediaType = m.mimeType?.split("/")[1];
            let format = m.mimeType?.split("/")[0]; // "image" or "video"

            const parts = m.content.match(/^data:(image|video)\/([^;]+);base64,(.*)/);
            if ((!parts || parts.length < 3) && !mediaType) {
              logger.error({ content: m.content.substring(0, 256) }, "Invalid image format");
              throw new Error(
                "Invalid image format, expected base64 data URL starting with 'data:image/xxxl;base64,...',"
              );
            } else if (parts) {
              // parts[0] is the full match, parts[1] is the media type, parts[2] is the base64 data
              base64Data = parts[3]; // e.g., "iVBORw0KGgoAAAANSUhEUgAA..."
              mediaType = parts[2]; // e.g., "jpeg", "png"
              format = parts[1]; // e.g., "image", "video"
            }

            if (format === "image") {
              const image: ContentBlock = {
                image: {
                  format: mediaType as ImageFormat,
                  source: {
                    // get base64Data as Uint8Array
                    bytes: new Uint8Array(Buffer.from(base64Data, "base64")),
                  },
                },
              };
              return image;
            } else {
              const video: ContentBlock = {
                video: {
                  format: mediaType as VideoFormat,
                  source: {
                    bytes: new Uint8Array(Buffer.from(base64Data, "base64")),
                  },
                },
              };
              return video;
            }
          } else if (m.contentType === "text") {
            return {
              text: m.content,
            };
          } else {
            return undefined; // Ignore unsupported content types
          }
        })
        .filter(notEmpty); // Filter out any null values

      return {
        role: msg.role === MessageRole.ASSISTANT ? "assistant" : "user",
        content,
      };
    });

    const command: ConverseCommandInput = {
      modelId,
      messages: requestMessages,
      inferenceConfig: {
        maxTokens,
        temperature,
        topP,
        stopSequences: [],
      },
    };

    if (modelId.includes("claude-sonnet-4-5") && temperature != null && topP != null) {
      delete command.inferenceConfig?.topP;
    }

    if (systemPrompt) {
      command.system = [{ text: systemPrompt }];
    }

    logger.trace(command, "Call Bedrock Converse API");
    return command;
  }

  private parseConverseResponse(response: ConverseCommandOutput, request: CompleteChatRequest): ModelResponse {
    logger.trace({ responseBody: response }, "Bedrock Converse response");

    if (!response.output?.message?.content) {
      return {
        type: "text",
        content: "",
      };
    }

    const { content, files } = response.output?.message?.content?.reduce(
      (res, item) => {
        if ("text" in item) {
          res.content += (res.content ? "\n\n" : "") + (item.text || "");
        } else if ("image" in item && item.image) {
          if (item.image.source?.bytes) {
            const imageData =
              `data:image/${item.image.format || "png"};base64,` +
              Buffer.from(item.image.source.bytes).toString("base64");
            res.files.push(imageData);
          } else if (item.image.source?.s3Location) {
            res.content += `|Image ${item.image.format}: ${item.image.source?.s3Location}|\n\n`;
          }
        }
        return res;
      },
      { content: "", files: [] as string[] }
    );

    const metadata: MessageMetadata | undefined =
      response.usage || response.metrics
        ? {
            usage: {
              inputTokens: response.usage?.inputTokens,
              outputTokens: response.usage?.outputTokens,
              cacheReadInputTokens: response.usage?.cacheReadInputTokens,
              cacheWriteInputTokens: response.usage?.cacheWriteInputTokens,
              invocationLatency: response.metrics?.latencyMs,
            },
          }
        : undefined;

    return {
      // for now only images are supported
      type: files.length ? "image" : "text",
      content,
      files,
      metadata,
    };
  }
}
