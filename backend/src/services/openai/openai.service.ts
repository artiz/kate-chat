import axios from "axios";
import {
  AIModelInfo,
  ApiProvider,
  ModelMessageFormat,
  ModelResponse,
  ProviderInfo,
  StreamCallbacks,
  UsageCostInfo,
  ServiceCostInfo,
} from "@/types/ai.types";
import { MessageRole } from "@/entities/Message";
import { createLogger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/errors";

const logger = createLogger(__filename);

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
  has_more: boolean;
  next_page?: string;
  data: T[];
};

export class OpenApiService {
  private openaiApiKey: string;
  private openaiApiAdminKey: string;
  private baseUrl: string;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || "";
    this.openaiApiAdminKey = process.env.OPENAI_API_ADMIN_KEY || "";
    this.baseUrl = process.env.OPENAI_API_URL || "https://api.openai.com/v1";

    if (!this.openaiApiKey) {
      logger.warn("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
    }
  }

  private getHeaders(isAdmin = false): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${isAdmin ? this.openaiApiAdminKey : this.openaiApiKey}`,
    };
  }

  // Text generation with OpenAI models
  async invokeModel(
    messages: ModelMessageFormat[],
    modelId: string,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<ModelResponse> {
    if (!this.openaiApiKey) {
      throw new Error("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
    }

    // Determine if this is an image generation request
    if (modelId.startsWith("dall-e")) {
      return this.generateImage(messages, modelId);
    }

    // Format messages for OpenAI API
    const formattedMessages = messages.map(msg => ({
      role: this.mapMessageRole(msg.role),
      content: msg.content,
    }));

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: modelId,
          messages: formattedMessages,
          temperature,
          max_tokens: maxTokens,
        },
        { headers: this.getHeaders() }
      );

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
  async invokeModelAsync(
    messages: ModelMessageFormat[],
    modelId: string,
    callbacks: StreamCallbacks,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<void> {
    if (!this.openaiApiKey) {
      callbacks.onError?.(new Error("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables."));
      return;
    }

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

    // Format messages for OpenAI API
    const formattedMessages = messages.map(msg => ({
      role: this.mapMessageRole(msg.role),
      content: msg.content,
    }));

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: modelId,
          messages: formattedMessages,
          temperature,
          max_tokens: maxTokens,
          stream: true,
        },
        {
          headers: this.getHeaders(),
          responseType: "stream",
        }
      );

      let fullResponse = "";

      response.data.on("data", (chunk: Buffer) => {
        let token: string = "";

        try {
          const json = JSON.parse(chunk.toString());
          token = json.choices[0]?.delta?.content || "";
          if (token) {
            fullResponse += token;
            callbacks.onToken?.(token);
          }
        } catch (ex: unknown) {
          logger.error(ex, "Failed to parse chunk data");
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
  private mapMessageRole(role: MessageRole): string {
    switch (role) {
      case MessageRole.USER:
        return "user";
      case MessageRole.ASSISTANT:
        return "assistant";
      case MessageRole.SYSTEM:
        return "system";
      default:
        return "user";
    }
  }

  // Image generation implementation for DALL-E models
  private async generateImage(messages: ModelMessageFormat[], modelId: string): Promise<ModelResponse> {
    if (!this.openaiApiKey) {
      throw new Error("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
    }

    // Extract the prompt from the last user message
    const userMessages = messages.filter(msg => msg.role === MessageRole.USER);
    if (!userMessages.length) {
      throw new Error("No user prompt provided for image generation");
    }

    const prompt = userMessages[userMessages.length - 1].content;

    const params = {
      model: modelId,
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    };

    logger.debug({ params }, "Image generation");
    try {
      const response = await axios.post(`${this.baseUrl}/images/generations`, params, { headers: this.getHeaders() });

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

  // Helper method to get all supported OpenAI models with their metadata
  // Get OpenAI provider information including account details
  async getOpenAIInfo(): Promise<ProviderInfo> {
    const isConnected = !!this.openaiApiKey;
    const details: Record<string, string | number | boolean> = {
      apiUrl: this.baseUrl,
      configured: isConnected,
    };

    try {
      // Fetch models
      await axios.get(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
      });

      details.credentialsValid = true;
    } catch (error) {
      logger.error(error, "Error fetching OpenAI models information");
      details.credentialsValid = false;
    }

    return {
      id: ApiProvider.OPEN_AI,
      name: "OpenAI",
      costsInfoAvailable: !!this.openaiApiAdminKey,
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
    if (!this.openaiApiAdminKey) {
      result.error = "OpenAI API admin key is not set. Set OPENAI_API_ADMIN_KEY in environment variables.";
      return result;
    }

    logger.debug({ startTime, endTime }, "Fetching OpenAI usage costs");

    try {
      const response = await axios.get<OpenAIList<OpenAICost>>(
        `${this.baseUrl}/organization/costs?start_time=${startTime || ""}${endTime ? "&end_time=" + endTime : ""}&group_by=project_id&limit=100`,
        {
          headers: this.getHeaders(true),
        }
      );
      // TODO: Handle pagination if needed

      const costsData = response.data.data
        .filter(item => item.results?.length)
        .map(item => item.results)
        .flat();

      const costsPerProject = costsData.reduce(
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
    } catch (error) {
      logger.error(error, "Error fetching OpenAI usage information");
      result.error = getErrorMessage(error);
      return result;
    }
  }

  async getOpenAIModels(): Promise<Record<string, AIModelInfo>> {
    if (!this.openaiApiKey) {
      logger.warn("OpenAI API key is not set. Set OPENAI_API_KEY in environment variables.");
      return {};
    }

    const models: Record<string, AIModelInfo> = {};

    try {
      // Fetch models from OpenAI API
      const response = await axios.get(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
      });

      const openaiModels = response.data.data;

      // Filter and map models
      for (const model of openaiModels) {
        // Filter for GPT models and DALL-E
        const supportsImage = model.id.includes("dall-e");

        models[model.id] = {
          apiProvider: ApiProvider.OPEN_AI,
          provider: "OpenAI",
          name: getModelName(model.id),
          description: `${model.id} by OpenAI`,
          supportsStreaming: !supportsImage,
          supportsTextIn: true,
          supportsTextOut: !supportsImage,
          supportsImageIn: false,
          supportsImageOut: supportsImage,
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
