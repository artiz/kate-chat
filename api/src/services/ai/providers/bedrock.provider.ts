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
  Tool,
  ToolUseBlock,
} from "@aws-sdk/client-bedrock-runtime";
import { BedrockClient, ListFoundationModelsCommand, ModelModality } from "@aws-sdk/client-bedrock";
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
  MessageRole,
  ModelMessage,
  ResponseStatus,
  ToolType,
  ChatToolCallResult,
} from "@/types/ai.types";
import BedrockModelConfigs from "@/config/data/bedrock-models-config.json";
import { createLogger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/errors";
import { BaseApiProvider } from "./base.provider";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { YandexWebSearch } from "../tools/yandex.web_search";
import { BEDROCK_TOOLS, WEB_SEARCH_TOOL_NAME, parseToolUse, callBedrockTool } from "./bedrock.tools";
import { ApiProvider } from "@/config/ai/common";
import { FileContentLoader } from "@/services/data";

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

  constructor(connection: ConnectionParams, fileLoader?: FileContentLoader) {
    super(connection, fileLoader);

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
    this.bedrockClient = new BedrockRuntimeClient({
      ...config,
      retryMode: "standard", // https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html
      maxAttempts: 10, // Set max attempts for retries
    });

    // AWS Bedrock management client for non-runtime operations (listing models, etc.)
    this.bedrockManagementClient = new BedrockClient(config);
  }

  async completeChat(request: CompleteChatRequest, messages: ModelMessage[] = []): Promise<ModelResponse> {
    if (!this.bedrockClient) {
      throw new Error("AWS Bedrock client is not initialized. Please check your AWS credentials and region.");
    }

    const conversationMessages: ConverseMessage[] = [];
    let requestCompleted = false;
    let finalResponse: ModelResponse | undefined;

    do {
      // Get provider service and parameters
      const input = await this.formatConverseParams(request, messages);
      // Append any tool result messages from previous iterations
      if (input.messages) {
        input.messages = [...input.messages, ...conversationMessages];
      }

      const command = new ConverseCommand(input);
      const response = await this.bedrockClient.send(command);
      const { modelResponse, stopReason, toolUse = [] } = this.parseConverseResponse(response, request);

      // Check if model wants to use a tool
      if (stopReason === "tool_use" && toolUse.length > 0) {
        logger.debug({ toolUse }, "Tool use requested");

        // Add assistant message with tool use to conversation
        if (response.output?.message) {
          conversationMessages.push(response.output.message);
        }

        // Execute tools and collect results
        const toolResultContent: ContentBlock[] = [];
        for (const call of toolUse) {
          const toolCall = parseToolUse(call);
          if (toolCall.error) {
            toolResultContent.push({
              toolResult: {
                toolUseId: toolCall.toolUseId,
                content: [{ text: toolCall.error }],
                status: "error",
              },
            });
          } else {
            const result = await callBedrockTool(toolCall, this.connection);
            toolResultContent.push({
              toolResult: result,
            });
          }
        }

        // Add tool results as user message
        conversationMessages.push({
          role: "user",
          content: toolResultContent,
        });

        requestCompleted = false;
      } else {
        finalResponse = modelResponse;
        requestCompleted = true;
      }
    } while (!requestCompleted);

    return finalResponse || { type: "text", content: "" };
  }

  // Stream response from models using InvokeModelWithResponseStreamCommand
  async streamChatCompletion(
    request: CompleteChatRequest,
    messages: ModelMessage[],
    callbacks: StreamCallbacks
  ): Promise<void> {
    if (!this.bedrockClient) {
      const err = new Error("AWS Bedrock client is not initialized. Please check your AWS credentials and region.");
      await callbacks.onError(err);
      return;
    }

    await callbacks.onStart();

    const conversationMessages: ConverseMessage[] = [];
    let requestCompleted = false;

    do {
      try {
        const input = await this.formatConverseParams(request, messages);
        // Append any tool result messages from previous iterations
        input.messages = [...(input.messages || []), ...conversationMessages];

        // reset tool choice for nova models after first call to avoid infinite loops
        if (input.modelId?.includes("amazon.nova") && conversationMessages.length > 0 && input.toolConfig) {
          input.toolConfig.toolChoice = undefined;
        }

        const command = new ConverseStreamCommand(input);
        const streamResponse = await this.bedrockClient.send(command);

        let fullResponse = "";
        let reasoningContent = "";
        let metadata: MessageMetadata | undefined = undefined;
        let streamedToolUse: ToolUseBlock[] = [];
        let currentToolUse: ToolUseBlock | null = null;

        // Process the stream
        if (!streamResponse?.stream) {
          await callbacks.onComplete({
            type: "text",
            content: "_No response_",
          });
          requestCompleted = true;
          break;
        }

        for await (const chunk of streamResponse.stream) {
          if (chunk.contentBlockDelta?.delta) {
            const delta = chunk.contentBlockDelta.delta;
            if (delta.text) {
              fullResponse += delta.text;
              await callbacks.onProgress(delta.text);
            } else if (delta.reasoningContent) {
              reasoningContent += delta.reasoningContent;
              await callbacks.onProgress("", { status: ResponseStatus.REASONING, detail: reasoningContent });
            } else if (delta.toolUse && currentToolUse) {
              currentToolUse.input += delta.toolUse.input || "";
              const status =
                currentToolUse.name === WEB_SEARCH_TOOL_NAME ? ResponseStatus.WEB_SEARCH : ResponseStatus.TOOL_CALL;
              await callbacks.onProgress("", { status, detail: currentToolUse.input as string }, true);
            }
          } else if (chunk.contentBlockStart?.start?.toolUse) {
            currentToolUse = {
              toolUseId: chunk.contentBlockStart.start.toolUse.toolUseId,
              name: chunk.contentBlockStart.start.toolUse.name,
              input: "",
            };
          } else if (chunk.contentBlockStop && currentToolUse) {
            currentToolUse.input =
              typeof currentToolUse.input === "string" ? JSON.parse(currentToolUse.input.trim()) : currentToolUse.input;
            streamedToolUse.push(currentToolUse);
            currentToolUse = null;
            reasoningContent = "";
          } else if (chunk.metadata?.usage) {
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

          if (chunk.messageStop?.stopReason === "tool_use" && streamedToolUse.length > 0) {
            // Tool use detected - notify callback
            const toolCalls = streamedToolUse.map(tu => ({
              name: tu.name || "unknown",
              callId: tu.toolUseId || tu.name || "unknown",
              args: typeof tu.input === "string" ? tu.input : JSON.stringify(tu.input || {}),
            }));

            const status =
              streamedToolUse.length === 1 && streamedToolUse[0].name === WEB_SEARCH_TOOL_NAME
                ? ResponseStatus.WEB_SEARCH
                : ResponseStatus.TOOL_CALL;

            const detail =
              streamedToolUse.length === 1
                ? JSON.stringify(streamedToolUse[0].input || {})
                : `Call tools: ${streamedToolUse.map(t => t.name).join(", ")}`;

            await callbacks.onProgress("", { status, detail, toolCalls });

            // Build assistant message with tool use for conversation history
            const assistantContent: ContentBlock[] = [];
            if (fullResponse) {
              assistantContent.push({ text: fullResponse });
            }
            streamedToolUse.forEach((tu, ndx) => {
              assistantContent.push({
                toolUse: {
                  toolUseId: tu.toolUseId,
                  name: tu.name,
                  input: tu.input,
                },
              });
            });

            conversationMessages.push({
              role: "assistant",
              content: assistantContent,
            });

            // Execute tools
            const toolResultContent: ContentBlock[] = [];
            const toolResults: ChatToolCallResult[] = [];

            for (const toolUse of streamedToolUse) {
              const toolCall = parseToolUse(toolUse);

              if (toolCall.error) {
                toolResultContent.push({
                  toolResult: {
                    toolUseId: toolCall.toolUseId,
                    content: [{ text: toolCall.error }],
                    status: "error",
                  },
                });

                toolResults.push({
                  name: toolCall.name,
                  content: toolCall.error,
                  callId: toolCall.toolUseId,
                });
              } else {
                const result = await callBedrockTool(toolCall, this.connection);
                toolResultContent.push({
                  toolResult: result,
                });

                const content = result.content?.[0] && "text" in result.content[0] ? result.content[0].text || "" : "";
                toolResults.push({
                  name: toolCall.name,
                  content,
                  callId: toolCall.toolUseId,
                });
              }
            }

            // Add tool results as user message
            conversationMessages.push({
              role: "user",
              content: toolResultContent,
            });
            await callbacks.onProgress("", { status: ResponseStatus.TOOL_CALL_COMPLETED, detail, tools: toolResults });

            // Reset for next iteration
            fullResponse = "";
            streamedToolUse = [];
            requestCompleted = false;
            break; // Break to restart streaming with tool results
          }

          if (chunk.internalServerException) {
            await callbacks.onError(chunk.internalServerException);
          } else if (chunk.modelStreamErrorException) {
            await callbacks.onError(chunk.modelStreamErrorException);
          } else if (chunk.validationException) {
            await callbacks.onError(chunk.validationException);
          } else if (chunk.throttlingException) {
            await callbacks.onError(chunk.throttlingException);
          } else if (chunk.serviceUnavailableException) {
            await callbacks.onError(chunk.serviceUnavailableException);
          }

          if (chunk.messageStop?.stopReason && chunk.messageStop.stopReason !== "tool_use") {
            requestCompleted = true;
          }
        }

        if (requestCompleted) {
          await callbacks.onComplete(
            {
              type: "text",
              content: fullResponse,
            },
            metadata
          );
        }
      } catch (e: unknown) {
        logger.error(e, "InvokeModelWithResponseStreamCommand failed");
        await callbacks.onError(e instanceof Error ? e : new Error(getErrorMessage(e)));
        requestCompleted = true;
      }
    } while (!requestCompleted);
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

    let body = "";
    const { modelId } = request;
    const isV2 = modelId.includes("embed-text-v2");

    if (modelId == "cohere.embed-multilingual-v3") {
      body = JSON.stringify({
        texts: [request.input],
        input_type: "search_query",
        truncate: "END",
        dimensions: request.dimensions,
      });
    } else {
      body = JSON.stringify({
        inputText: request.input,
        dimensions: isV2 ? request.dimensions : undefined,
      });
    }

    const params = {
      modelId: request.modelId,
      body,
    };

    // Send command using Bedrock client
    const command = new InvokeModelCommand(params);
    const response = await this.bedrockClient.send(command);

    // Parse the response body
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    return {
      embedding: responseBody.embedding || responseBody.embeddings?.[0] || [],
      metadata: {
        usage: {
          inputTokens: responseBody.inputTextTokenCount || 0,
        },
      },
    };
  }

  private async formatConverseParams(
    request: CompleteChatRequest,
    messages: ModelMessage[] = []
  ): Promise<ConverseCommandInput> {
    const { systemPrompt, modelId, temperature, maxTokens, topP, tools: inputTools } = request;

    const requestMessages: ConverseMessage[] = [];

    for (const msg of messages) {
      if (typeof msg.body === "string") {
        requestMessages.push({
          role: msg.role === MessageRole.ASSISTANT ? "assistant" : "user",
          content: [{ text: msg.body }],
        });
        continue;
      }

      const content: ContentBlock[] = [];
      for (const part of msg.body) {
        if (part.contentType === "image" || part.contentType === "video") {
          // input format "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABv..."

          if (!this.fileLoader) {
            logger.warn(`File loader is not connected, cannot load image content: ${part.fileName}`);
            continue;
          }

          const bytes = await this.fileLoader.getFileContent(part.fileName);

          let mediaType = part.mimeType?.split("/")[1];
          let format = part.mimeType?.split("/")[0]; // "image" or "video"

          if (format === "image") {
            const image: ContentBlock = {
              image: {
                format: mediaType as ImageFormat,
                source: {
                  bytes,
                },
              },
            };

            content.push(image);
          } else {
            const video: ContentBlock = {
              video: {
                format: mediaType as VideoFormat,
                source: {
                  bytes,
                },
              },
            };
            content.push(video);
          }
        } else if (part.contentType === "text") {
          content.push({
            text: part.content,
          });
        }
      }

      requestMessages.push({
        role: msg.role === MessageRole.ASSISTANT ? "assistant" : "user",
        content,
      });
    }

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

    if (systemPrompt && !modelId.includes("amazon.titan")) {
      command.system = [{ text: systemPrompt }];
    }

    // Add tool configuration if tools are requested
    if (inputTools && inputTools.length > 0) {
      const tools: Tool[] = [];

      // Add web search tool if requested
      if (inputTools.find(t => t.type === ToolType.WEB_SEARCH)) {
        const webSearchTool = BEDROCK_TOOLS[WEB_SEARCH_TOOL_NAME];
        if (webSearchTool) {
          tools.push(webSearchTool);
        }
      }

      if (tools.length > 0) {
        if (modelId?.includes("amazon.nova")) {
          command.toolConfig = {
            tools,
            toolChoice: {
              tool: { name: tools[0]?.toolSpec?.name || "" },
            },
          };
        } else {
          command.toolConfig = {
            tools,
          };
        }
      }
    }

    logger.trace(command, "Call Bedrock Converse API");
    return command;
  }

  private parseConverseResponse(
    response: ConverseCommandOutput,
    request: CompleteChatRequest
  ): {
    modelResponse: ModelResponse;
    toolUse?: ToolUseBlock[]; // Tool use blocks from the model (Bedrock specific)
    stopReason?: string; // Stop reason from the model response
  } {
    logger.trace({ responseBody: response }, "Bedrock Converse response");

    if (!response.output?.message?.content) {
      return {
        modelResponse: {
          type: "text",
          content: "",
        },
      };
    }

    const { content, files, toolUse } = response.output?.message?.content?.reduce(
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
        } else if ("toolUse" in item && item.toolUse) {
          res.toolUse.push(item.toolUse);
        }
        return res;
      },
      { content: "", files: [] as string[], toolUse: [] as ToolUseBlock[] }
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
      modelResponse: {
        // for now only images are supported
        type: files.length ? "image" : "text",
        content,
        files,
        metadata,
      },
      toolUse: toolUse.length > 0 ? toolUse : undefined,
      stopReason: response.stopReason,
    };
  }

  async stopRequest(requestId: string, modelId: string): Promise<void> {
    // Bedrock does not support request cancellation
    throw new Error("Request cancellation is not supported by AWS Bedrock");
  }
}
