import { Agent, Dispatcher } from "undici";
import {
  ApiProvider,
  InvokeModelParamsRequest,
  ModelResponse,
  ProviderInfo,
  StreamCallbacks,
  AIModelInfo,
  UsageCostInfo,
  ModelMessage,
} from "@/types/ai.types";
import { createLogger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/errors";
import axios from "axios";
import { MessageRole } from "@/types/ai.types";
import { YANDEX_FM_API_URL, YANDEX_MODELS } from "@/config/yandex";
import { BaseProviderService } from "../base.provider";
import { ConnectionParams } from "@/middleware/auth.middleware";

const agent = new Agent({
  keepAliveTimeout: 30_000,
  connections: 100, // pool
});

const logger = createLogger(__filename);

// Type definitions for Yandex API
export type YandexMessageRole = "user" | "assistant" | "system";

export type YandexMessage = {
  role: YandexMessageRole;
  text: string;
};

export type YandexCompletionRequest = {
  modelUri: string;
  messages: YandexMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
};

export type YandexCompletionResponse = {
  result: {
    alternatives: [
      {
        message: {
          role: YandexMessageRole;
          text: string;
        };
        status: string;
      },
    ];
    usage: {
      inputTextTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
};

export class YandexService extends BaseProviderService {
  private apiKey: string;
  private folderId: string;

  constructor(connection: ConnectionParams) {
    super(connection);
    this.apiKey = connection.YANDEX_FM_API_KEY || "";
    this.folderId = connection.YANDEX_FM_API_FOLDER || "";
  }

  // Convert messages to Yandex format
  private formatMessages(messages: ModelMessage[], systemPrompt?: string): YandexMessage[] {
    const yandexMessages: YandexMessage[] = messages.map(msg => {
      const role: YandexMessageRole = msg.role === MessageRole.ASSISTANT ? "assistant" : "user";

      let text: string;
      if (typeof msg.body === "string") {
        text = msg.body;
      } else {
        // Handle multipart messages (only use text parts)
        text = msg.body
          .filter((m: any) => m.contentType === "text")
          .map((m: any) => m.content)
          .join("\n");
      }

      return { role, text };
    });

    // Add system prompt if provided
    if (systemPrompt) {
      yandexMessages.unshift({
        role: "system",
        text: systemPrompt,
      });
    }

    return yandexMessages;
  }

  // Invoke Yandex model for text generation
  async invokeModel(request: InvokeModelParamsRequest): Promise<ModelResponse> {
    if (!this.apiKey) {
      throw new Error("Yandex API key is not set. Set YANDEX_FM_API_KEY/YANDEX_FM_API_FOLDER in connection seettings.");
    }

    const { systemPrompt, messages = [], modelId, temperature, maxTokens } = request;
    const yandexMessages = this.formatMessages(messages, systemPrompt);
    const modelUri = modelId.replace("{folder}", this.folderId ?? "default");

    const body: YandexCompletionRequest = {
      modelUri,
      messages: yandexMessages,
      temperature,
      maxTokens,
    };

    logger.debug({ modelUri, temperature, maxTokens }, "Invoking Yandex model");

    try {
      // Make API request to Yandex
      const response = await axios.post<YandexCompletionResponse>(
        YANDEX_FM_API_URL + "/foundationModels/v1/completion",
        body,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Api-Key ${this.apiKey}`,
          },
          fetchOptions: {
            dispatcher: agent,
          },
        }
      );

      // Parse response
      const result = response.data;
      logger.debug({ result }, "Yandex model response");

      const alternative = result.result.alternatives[0] || {};

      return {
        type: "text",
        content: alternative.message?.text || "",
        metadata: {
          usage: {
            inputTokens: result.result?.usage?.inputTextTokens,
            outputTokens: result.result?.usage?.completionTokens,
          },
        },
      };
    } catch (error) {
      logger.error(error, "Error invoking Yandex model");
      throw new Error(`Error invoking Yandex model: ${getErrorMessage(error)}`);
    }
  }

  // Streaming implementation for Yandex
  async invokeModelAsync(request: InvokeModelParamsRequest, callbacks: StreamCallbacks): Promise<void> {
    if (!this.apiKey || !this.folderId) {
      callbacks.onError?.(
        new Error("Yandex API key is not set. Set YANDEX_FM_API_KEY/YANDEX_FM_API_FOLDER in environment variables.")
      );
      return;
    }

    callbacks.onStart?.();

    const { systemPrompt, messages = [], modelId, temperature, maxTokens } = request;
    const yandexMessages = this.formatMessages(messages, systemPrompt);
    const modelUri = modelId.replace("{folder}", this.folderId ?? "default");

    const body: YandexCompletionRequest = {
      stream: true,
      modelUri,
      messages: yandexMessages,
      temperature,
      maxTokens,
    };

    logger.debug({ body, modelUri }, "Invoking Yandex model streaming");

    try {
      const response = await axios.post(YANDEX_FM_API_URL + "/foundationModels/v1/completion", body, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Api-Key ${this.apiKey}`,
        },
        responseType: "stream",
        fetchOptions: {
          dispatcher: agent,
        },
      });

      let fullResponse = "";

      response.data.on("data", (chunk: Buffer) => {
        const data = chunk.toString("utf8")?.trim();

        try {
          logger.debug("Received chunk:" + data);

          const result = JSON.parse(data);
          const token = result.result.alternatives[0]?.message?.text || "";

          if (token) {
            fullResponse += token;
            callbacks.onToken?.(token);
          }
        } catch (error: unknown) {
          logger.error(error, "Failed to parse chunk data: " + data);
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

  async getInfo(checkConnection = false): Promise<ProviderInfo> {
    const isConnected = !!this.apiKey;

    const details: Record<string, string | number | boolean | undefined> = {
      configured: isConnected,
      credentialsValid: "N/A",
      folderId: this.folderId || "N/A",
    };

    return {
      id: ApiProvider.YANDEX_FM,
      name: BaseProviderService.getApiProviderName(ApiProvider.YANDEX_FM),
      isConnected,
      costsInfoAvailable: false, // Yandex doesn't support cost retrieval via API
      details,
    };
  }

  // Get available Yandex models
  async getModels(): Promise<Record<string, AIModelInfo>> {
    // If API key is not set, return empty object
    if (!this.apiKey) {
      return {};
    }

    return YANDEX_MODELS.reduce(
      (map, model) => {
        map[model.uri] = {
          apiProvider: ApiProvider.YANDEX_FM,
          provider: BaseProviderService.getApiProviderName(ApiProvider.YANDEX_FM),
          name: model.name,
          description: model.description || "",
          supportsStreaming: true,
          supportsTextIn: true,
          supportsTextOut: true,
          supportsImageIn: false, // Yandex models do not support image input
          supportsImageOut: false, // Yandex models do not support image output
          supportsEmbeddingsIn: false, // Yandex does not support embeddings
        };

        return map;
      },
      {} as Record<string, AIModelInfo>
    );
  }

  // Costs are not available from Yandex API
  async getCosts(startTime: number, endTime?: number): Promise<UsageCostInfo> {
    return {
      start: new Date(startTime * 1000),
      end: endTime ? new Date(endTime * 1000) : undefined,
      error: "Cost information is not available from Yandex API",
      costs: [],
    };
  }
}
