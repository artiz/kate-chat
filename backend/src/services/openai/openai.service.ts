import axios from "axios";
import { Agent, Dispatcher } from "undici";
import {
  AIModelInfo,
  ApiProvider,
  ModelMessage,
  ModelResponse,
  ProviderInfo,
  StreamCallbacks,
  UsageCostInfo,
  ServiceCostInfo,
  InvokeModelParamsRequest,
} from "@/types/ai.types";
import { MessageRole } from "@/types/ai.types";
import { createLogger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/errors";
import { BaseProviderService } from "../base.provider";
import { ConnectionParams } from "@/middleware/auth.middleware";

const logger = createLogger(__filename);

const agent = new Agent({
  keepAliveTimeout: 30_000,
  connections: 100, // pool
});
const fetchOptions: Record<string, any> = {
  dispatcher: agent,
};

export interface OpenAICostResult {
  object: string;
  amount: {
    value: number;
    currency: string;
  };
  line_item: string | undefined;
  project_id: string | undefined;
  organization_id: string | undefined;
}

export interface OpenAICost {
  object: string;
  start_time: number;
  end_time: number;
  results: OpenAICostResult[];
}

export type OpenAIList<T> = {
  object: string;
  has_more?: boolean;
  next_page?: string;
  data: T[];
};

export type OpenAIModel = {
  id: string;
  object: string;
  created: number;
  owned_by?: string;
};

type OpenAiMessageRole = "developer" | "user" | "assistant";

type OpenAiRequestMessagePart =
  | string
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OpenAiRequestMessage = {
  role: OpenAiMessageRole;
  content: OpenAiRequestMessagePart[] | string;
};

export class OpenAIService extends BaseProviderService {
  private openAiApiKey: string;
  private openAiApiAdminKey: string;
  private baseUrl: string;

  constructor(connection: ConnectionParams) {
    super(connection);

    this.openAiApiKey = connection.OPENAI_API_KEY || "";
    this.openAiApiAdminKey = connection.OPENAI_API_ADMIN_KEY || "";
    this.baseUrl = process.env.OPENAI_API_URL || "https://api.openai.com/v1";

    if (!this.openAiApiKey) {
      logger.warn("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
    }
  }

  private getHeaders(isAdmin = false): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${isAdmin ? this.openAiApiAdminKey : this.openAiApiKey}`,
    };
  }

  // Text generation with OpenAI models
  // https://platform.openai.com/docs/guides/text?api-mode=chat
  formatMessages(messages: ModelMessage[], systemPrompt: string | undefined): OpenAiRequestMessage[] {
    // Format messages for OpenAI API
    const result: OpenAiRequestMessage[] = messages.map(msg => ({
      role: this.mapMessageRole(msg.role),
      content:
        typeof msg.body === "string"
          ? msg.body
          : msg.body
              .filter(part => part.content)
              .map(part => {
                if (part.contentType === "text") {
                  return { type: "text", text: part.content };
                } else if (part.contentType === "image") {
                  return {
                    type: "image_url",
                    image_url: {
                      url: part.content,
                    },
                  };
                } else {
                  logger.warn({ ...part }, `Unsupported message content type`);
                  return ""; // Ignore unsupported types
                }
              }),
    }));

    if (systemPrompt) {
      result.unshift({
        role: "developer",
        content: systemPrompt,
      });
    }

    return result;
  }

  formatModelRequest(inputRequest: InvokeModelParamsRequest): Record<string, any> {
    const { systemPrompt, messages = [], modelId, temperature, maxTokens } = inputRequest;

    const params: Record<string, any> = {
      model: modelId,
      messages: this.formatMessages(messages, systemPrompt),
      temperature,
      max_tokens: maxTokens,
    };

    if (modelId.startsWith("o1") || modelId.startsWith("o4")) {
      params.max_completion_tokens = maxTokens; // O1 models use max_completion_tokens
      params.max_tokens = undefined;
      params.temperature = undefined;
    } else if (modelId.startsWith("gpt-4o")) {
      params.temperature = undefined; // GPT-4o models do not support temperature
    }

    return params;
  }

  async invokeModel(inputRequest: InvokeModelParamsRequest): Promise<ModelResponse> {
    if (!this.openAiApiKey) {
      throw new Error("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
    }

    const { modelId, messages = [] } = inputRequest;

    // Determine if this is an image generation request
    if (modelId.startsWith("dall-e")) {
      return this.generateImage(messages, modelId);
    }

    const params = this.formatModelRequest(inputRequest);
    logger.debug({ ...params, messages: [] }, "Invoking OpenAI model");

    try {
      const response = await axios.post(`${this.baseUrl}/chat/completions`, params, {
        headers: this.getHeaders(),
        fetchOptions,
      });

      const content = response.data.choices[0]?.message?.content || "";

      return {
        type: "text",
        content,
      };
    } catch (error: unknown) {
      logger.error(error, "Error calling OpenAI API");
      if (axios.isAxiosError(error)) {
        throw new Error(`OpenAI API error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  // Stream response from OpenAI models
  async invokeModelAsync(inputRequest: InvokeModelParamsRequest, callbacks: StreamCallbacks): Promise<void> {
    if (!this.openAiApiKey) {
      callbacks.onError?.(new Error("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables."));
      return;
    }

    const { messages = [], modelId } = inputRequest;

    callbacks.onStart?.();

    // If this is an image generation model, generate the image non-streaming
    if (modelId === "dall-e-3" || modelId === "dall-e-2") {
      try {
        const response = await this.generateImage(messages, modelId);
        callbacks.onComplete?.(response.content);
      } catch (error) {
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }

    const params = this.formatModelRequest(inputRequest);
    params.stream = true;

    logger.debug({ ...params, messages: [] }, "Invoking OpenAI model streaming");

    try {
      const response = await axios.post(`${this.baseUrl}/chat/completions`, params, {
        headers: this.getHeaders(),
        responseType: "stream",
        fetchOptions,
      });

      let fullResponse = "";

      response.data.on("data", (chunk: Buffer) => {
        const data = chunk.toString("utf8")?.trim();

        try {
          const result = JSON.parse(data);
          const token = result.choices[0]?.delta?.content || "";
          if (token) {
            fullResponse += token;
            callbacks.onToken?.(token);
          }
        } catch (error: unknown) {
          if (error instanceof SyntaxError) {
            // extract valid JSON in case of rare formatting issues
            // https://community.openai.com/t/invalid-json-response-when-using-structured-output/1121650/4
            const jsons = data
              .split("\n")
              .map(line => line.trim())
              .filter(l => l && l.includes("{"))
              .map(line => line.replace(/^[^\{]*\{/m, "{").replace(/\}[^\}]*/m, "}"));

            for (const json of jsons) {
              try {
                const result = JSON.parse(json);
                const token = result.choices[0]?.delta?.content || "";
                if (token) {
                  fullResponse += token;
                  callbacks.onToken?.(token);
                }
              } catch (jsonError) {
                logger.error(jsonError, "Failed to parse JSON chunk: " + json);
              }
            }
          } else {
            logger.error(error, "Failed to parse chunk data: " + data);
          }
        }
      });

      response.data.on("end", () => {
        callbacks.onComplete?.(fullResponse);
      });

      response.data.on("error", (error: Error) => {
        callbacks.onError?.(error);
      });
    } catch (error) {
      logger.error(error, "Error streaming from OpenAI API");
      if (axios.isAxiosError(error)) {
        callbacks.onError?.(new Error(`OpenAI API error: ${error.response?.data?.error?.message || error.message}`));
      } else {
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  // Helper method to map our message roles to OpenAI roles
  private mapMessageRole(role: MessageRole): OpenAiMessageRole {
    switch (role) {
      case MessageRole.USER:
        return "user";
      case MessageRole.ASSISTANT:
      case MessageRole.ERROR:
        return "assistant";
      case MessageRole.SYSTEM:
        return "developer";
      default:
        return "user";
    }
  }

  // Image generation implementation for DALL-E models
  private async generateImage(messages: ModelMessage[], modelId: string): Promise<ModelResponse> {
    if (!this.openAiApiKey) {
      throw new Error("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
    }

    // Extract the prompt from the last user message
    const userMessages = messages.filter(msg => msg.role === MessageRole.USER);
    if (!userMessages.length) {
      throw new Error("No user prompt provided for image generation");
    }
    const lastUserMessage = userMessages[userMessages.length - 1].body;
    const prompt = Array.isArray(lastUserMessage)
      ? lastUserMessage
          .map(part => part.content)
          .join(" ")
          .trim()
      : lastUserMessage;

    if (!prompt) {
      throw new Error("Empty prompt provided for image generation");
    }

    const params = {
      model: modelId,
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    };

    logger.debug({ params }, "Image generation");
    try {
      const response = await axios.post(`${this.baseUrl}/images/generations`, params, {
        headers: this.getHeaders(),
        fetchOptions,
      });

      const imageData = response.data.data[0]?.b64_json || "";

      if (!imageData) {
        throw new Error("No image URL returned from OpenAI API");
      }

      return {
        type: "image",
        content: imageData,
      };
    } catch (error) {
      logger.error(error, "Error generating image with OpenAI");
      if (axios.isAxiosError(error)) {
        throw new Error(`OpenAI API error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  // Get OpenAI provider information including account details
  async getInfo(checkConnection = false): Promise<ProviderInfo> {
    const isConnected = !!this.openAiApiKey;
    const details: Record<string, string | number | boolean> = {
      apiUrl: this.baseUrl,
      configured: isConnected,
      credentialsValid: "N/A",
    };

    if (isConnected && checkConnection) {
      try {
        // Fetch models
        await axios.get(`${this.baseUrl}/models`, {
          headers: this.getHeaders(),
          fetchOptions,
        });

        details.credentialsValid = true;
      } catch (error) {
        logger.warn(error, "Error fetching OpenAI models information");
        details.credentialsValid = false;
      }
    }

    return {
      id: ApiProvider.OPEN_AI,
      name: BaseProviderService.getApiProviderName(ApiProvider.OPEN_AI),
      costsInfoAvailable: !!this.openAiApiAdminKey,
      isConnected,
      details,
    };
  }

  async getCosts(startTime: number, endTime?: number): Promise<UsageCostInfo> {
    const result: UsageCostInfo = {
      start: new Date(startTime * 1000),
      end: endTime ? new Date(endTime * 1000) : undefined,
      costs: [],
    };
    if (!this.openAiApiAdminKey) {
      result.error = "OpenAI API admin key is not set. Set OPENAI_API_ADMIN_KEY in environment variables.";
      return result;
    }

    logger.debug({ startTime, endTime }, "Fetching OpenAI usage costs");

    const costsResults: OpenAICostResult[] = [];
    let pagesLimit = 10; // Limit to 10 pages to avoid excessive API calls
    try {
      let page: string | undefined = undefined;
      do {
        const response = await axios.get<OpenAIList<OpenAICost>>(`${this.baseUrl}/organization/costs`, {
          params: {
            start_time: startTime || undefined,
            end_time: endTime || undefined,
            group_by: "project_id",
            limit: 100,
            page,
          },
          headers: this.getHeaders(true),
          fetchOptions,
        });

        const res: OpenAIList<OpenAICost> = response.data;
        const costsData = res.data
          .filter(item => item.results?.length)
          .map(item => item.results)
          .flat();

        costsResults.push(...costsData);
        page = res.next_page;
      } while (page && pagesLimit-- > 0);
    } catch (error) {
      logger.error(error, "Error fetching OpenAI usage information");
      result.error = getErrorMessage(error);
      return result;
    }

    const costsPerProject = costsResults.reduce(
      (acc, item) => {
        const projectId = item.project_id || "unknown";
        const amount = item.amount?.value || 0;
        const currency = item.amount?.currency;

        if (currency) {
          if (!acc[projectId]) {
            acc[projectId] = { [currency]: amount };
          }
          acc[projectId][currency] = (acc[projectId][currency] || 0) + amount;
        }

        return acc;
      },
      {} as Record<string, Record<string, number>>
    );

    // Prepare costs details
    result.costs = Object.entries(costsPerProject).map(([projectId, amounts]) => {
      const serviceCostInfo: ServiceCostInfo = {
        name: projectId,
        type: "project",
        amounts: Object.entries(amounts).map(([currency, amount]) => ({
          amount,
          currency,
        })),
      };

      return serviceCostInfo;
    });

    return result;
  }

  async getModels(): Promise<Record<string, AIModelInfo>> {
    if (!this.openAiApiKey) {
      logger.warn("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
      return {};
    }

    const models: Record<string, AIModelInfo> = {};

    try {
      // Fetch models from OpenAI API
      const response = await axios.get<OpenAIList<OpenAIModel>>(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
        fetchOptions,
      });

      const openaiModels = response.data.data;

      // Filter and map models
      for (const model of openaiModels) {
        // Filter for GPT models and DALL-E
        const supportsImageOut = model.id.startsWith("dall-e");
        const supportsImageIn = model.id.startsWith("gpt-4.1") || model.id.startsWith("gpt-4o");

        models[model.id] = {
          apiProvider: ApiProvider.OPEN_AI,
          provider: BaseProviderService.getApiProviderName(ApiProvider.OPEN_AI),
          name: getModelName(model.id),
          description: `${model.id} by OpenAI`,
          supportsStreaming: !supportsImageOut,
          supportsTextIn: true,
          supportsTextOut: !supportsImageOut,
          supportsImageIn,
          supportsImageOut,
          supportsEmbeddingsIn: false,
        };
      }

      // Add DALL-E models manually if not returned by the API
      if (!models["dall-e-3"]) {
        models["dall-e-3"] = {
          apiProvider: ApiProvider.OPEN_AI,
          provider: "OpenAI",
          name: "DALL-E 3",
          description: "DALL-E 3 by OpenAI - Advanced image generation",
          supportsStreaming: false,
          supportsTextIn: true,
          supportsTextOut: false,
          supportsImageIn: false,
          supportsImageOut: true,
          supportsEmbeddingsIn: false,
        };
      }

      if (!models["dall-e-2"]) {
        models["dall-e-2"] = {
          apiProvider: ApiProvider.OPEN_AI,
          provider: "OpenAI",
          name: "DALL-E 2",
          description: "DALL-E 2 by OpenAI - Image generation",
          supportsStreaming: false,
          supportsTextIn: true,
          supportsTextOut: false,
          supportsImageIn: false,
          supportsImageOut: true,
          supportsEmbeddingsIn: false,
        };
      }
    } catch (error) {
      logger.error(error, "Error fetching OpenAI models");
    }

    return models;
  }
}

function getModelName(id: string): string {
  // for names like gpt-4-turbo return GPT-4 Turbo
  const name = id
    .replace("gpt", "GPT")
    .replace("dall-e", "DALL-E")
    .replace(/-/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
  return name;
}
