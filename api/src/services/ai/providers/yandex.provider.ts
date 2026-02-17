import {
  CompleteChatRequest,
  ModelResponse,
  ProviderInfo,
  StreamCallbacks,
  AIModelInfo,
  UsageCostInfo,
  EmbeddingsResponse,
  GetEmbeddingsRequest,
  ModelMessage,
  ChatResponseStatus,
} from "@/types/ai.types";
import { YANDEX_MODELS } from "@/config/ai/yandex";
import { fetch } from "undici";
import { BaseApiProvider } from "./base.provider";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { OpenAIProtocol } from "../protocols/openai.protocol";
import { YandexWebSearch } from "../tools/yandex.web_search";
import { globalConfig } from "@/global-config";
import { FileContentLoader } from "@/services/data/s3.service";
import { notEmpty } from "@/utils/assert";
import { getErrorMessage } from "@/utils/errors";
import { ApiProvider, MessageRole, ModelType, ResponseStatus, ToolType } from "@/types/api";

export class YandexApiProvider extends BaseApiProvider {
  private apiKey: string;
  private folderId: string;
  private protocol: OpenAIProtocol;

  constructor(connection: ConnectionParams, fileLoader?: FileContentLoader) {
    super(connection, fileLoader);
    this.apiKey = connection.yandexFmApiKey || "";
    this.folderId = connection.yandexFmApiFolder || "";

    if (this.apiKey) {
      this.protocol = new OpenAIProtocol({
        apiType: "completions",
        baseURL: globalConfig.yandex.fmOpenApiUrl,
        apiKey: this.apiKey,
        connection,
        fileLoader,
      });
    }
  }

  // Invoke Yandex model for text generation
  async completeChat(request: CompleteChatRequest, messages: ModelMessage[] = []): Promise<ModelResponse> {
    if (!this.apiKey) {
      throw new Error("Yandex API key is not set. Set YANDEX_FM_API_KEY/YANDEX_FM_API_FOLDER in connection settings.");
    }

    const { modelId, modelType } = request;

    if (modelType === ModelType.IMAGE_GENERATION || modelId.includes("yandex-art")) {
      return this.generateImage(request, messages);
    }

    const openAiRequest = {
      ...request,
      modelId: modelId.replace("{folder}", this.folderId ?? "default"),
    };

    return this.protocol.completeChat(openAiRequest, messages);
  }

  async streamChatCompletion(
    request: CompleteChatRequest,
    messages: ModelMessage[],
    callbacks: StreamCallbacks
  ): Promise<void> {
    if (!this.apiKey || !this.folderId) {
      callbacks.onError(
        new Error("Yandex API key is not set. Set YANDEX_FM_API_KEY/YANDEX_FM_API_FOLDER in environment variables.")
      );
      return;
    }

    const { modelId, modelType } = request;

    if (modelType === ModelType.IMAGE_GENERATION || modelId.includes("yandex-art")) {
      callbacks.onStart({ status: ResponseStatus.STARTED });
      try {
        const response = await this.generateImage(request, messages, callbacks.onProgress);
        callbacks.onComplete(response);
      } catch (error) {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }

    const openAiRequest = {
      ...request,
      modelId: modelId.replace("{folder}", this.folderId ?? "default"),
    };

    return this.protocol.streamChatCompletion(openAiRequest, messages, callbacks);
  }

  private async generateImage(
    inputRequest: CompleteChatRequest,
    messages: ModelMessage[] = [],
    onProgress?: (token: string, status?: ChatResponseStatus, force?: boolean) => Promise<boolean | undefined>
  ): Promise<ModelResponse> {
    if (!this.apiKey || !this.folderId) {
      throw new Error("Yandex API key or Folder ID is not set.");
    }
    if (!globalConfig.features.imagesGeneration) {
      throw new Error("Image generation feature is disabled");
    }

    // Send placeholder image immediately for new requests
    if (onProgress) {
      await onProgress(
        `![Generated Image](/files/assets/generated_image_placeholder.png)`,
        {
          status: ResponseStatus.CONTENT_GENERATION,
        },
        true
      );
    }

    const { modelId } = inputRequest;
    const modelUri = modelId.replace("{folder}", this.folderId);

    const userMessages = messages.filter(msg => msg.role === MessageRole.USER);
    if (!userMessages.length) {
      throw new Error("No user prompt provided for image generation");
    }

    const promptMessages = userMessages.map((msg, ndx) =>
      Array.isArray(msg.body)
        ? {
            text: msg.body
              .map(part => (part.contentType === "text" ? part.content : ""))
              .join("\n")
              .trim(),
            weight: ndx === userMessages.length - 1 ? 1 : 0.5,
          }
        : {
            text: msg.body,
            weight: ndx === userMessages.length - 1 ? 1 : 0.5,
          }
    );

    const authHeader = this.apiKey.startsWith("t1") ? `Bearer ${this.apiKey}` : `Api-Key ${this.apiKey}`;
    const url = `${globalConfig.yandex.fmApiUrl}/foundationModels/v1/imageGenerationAsync`;

    // 1. Start generation
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        "x-folder-id": this.folderId,
      },
      body: JSON.stringify({
        modelUri,
        generationOptions: {
          mimeType: "image/png",
          aspectRatio: {
            widthRatio: 1,
            heightRatio: 1,
          },
        },
        messages: promptMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Yandex Art API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const operation = (await response.json()) as { id: string };
    const operationId = operation.id;

    // 2. Poll for completion
    return this.pollImageGenerationResult(operationId);
  }

  async pollImageGenerationResult(operationId: string): Promise<ModelResponse> {
    const maxRetries = 60;
    let finalResponse: any = null;
    const authHeader = this.apiKey.startsWith("t1") ? `Bearer ${this.apiKey}` : `Api-Key ${this.apiKey}`;

    for (let i = 0; i < maxRetries; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const opUrl = `${globalConfig.yandex.fmApiUrl}/operations/${operationId}`;
      const opResponse = await fetch(opUrl, {
        headers: {
          Authorization: authHeader,
        },
      });

      if (!opResponse.ok) {
        const errorText = await opResponse.text();
        throw new Error(`Yandex Operations API error: ${opResponse.status} ${opResponse.statusText} - ${errorText}`);
      }

      const opData = (await opResponse.json()) as any;
      if (opData.done) {
        if (opData.error) {
          throw new Error(`Yandex Art generation failed: ${opData.error.message} (${opData.error.code})`);
        }
        finalResponse = opData.response;
        break;
      }
    }

    if (!finalResponse) {
      throw new Error("Yandex Art generation timed out");
    }

    // 3. Return result
    const base64Image = finalResponse.image;

    return {
      type: "image",
      content: "",
      files: [base64Image],
    };
  }

  async getInfo(checkConnection = false): Promise<ProviderInfo> {
    let isConnected = Boolean(this.apiKey && this.folderId);

    const details: Record<string, string | number | boolean | undefined> = {
      folderId: this.folderId || "N/A",
    };

    if (checkConnection && isConnected) {
      try {
        const searchAvailable = await YandexWebSearch.isAvailable(this.connection);
        if (!searchAvailable) {
          details.status = "Yandex Web Search tool is not available with the provided credentials.";
        } else {
          details.status = "OK";
        }
      } catch (error) {
        details.status = `Connection check failed: ${getErrorMessage(error)}`;
        isConnected = false;
      }
    }

    return {
      id: ApiProvider.YANDEX_FM,
      name: BaseApiProvider.getApiProviderName(ApiProvider.YANDEX_FM),
      isConnected,
      costsInfoAvailable: false, // Yandex doesn't support cost retrieval via API
      details,
    };
  }

  // Get available Yandex models
  async getModels(): Promise<Record<string, AIModelInfo>> {
    if (!this.apiKey) {
      return {};
    }

    const searchAvailable = await YandexWebSearch.isAvailable(this.connection);
    return YANDEX_MODELS.reduce(
      (map, model) => {
        if (globalConfig.yandex.ignoredModels.some(ignoredModel => model.uri.includes(ignoredModel))) {
          return map; // Skip ignored models
        }

        map[model.uri] = {
          apiProvider: ApiProvider.YANDEX_FM,
          provider: BaseApiProvider.getApiProviderName(ApiProvider.YANDEX_FM),
          name: model.name,
          description: model.description || "",
          streaming: true,
          maxInputTokens: model.maxInputTokens,
          tools: [searchAvailable ? ToolType.WEB_SEARCH : null, ToolType.MCP].filter(notEmpty),
          imageInput: model.imageInput || false,
          type: model.type || ModelType.CHAT,
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

  async getEmbeddings(request: GetEmbeddingsRequest): Promise<EmbeddingsResponse> {
    if (!this.apiKey || !this.folderId) {
      throw new Error("Yandex API key or Folder ID is not set.");
    }

    const { modelId, input } = request;
    const modelUri = modelId.replace("{folder}", this.folderId);

    const url = `${globalConfig.yandex.fmApiUrl}/foundationModels/v1/textEmbedding`;
    const authHeader = this.apiKey.startsWith("t1") ? `Bearer ${this.apiKey}` : `Api-Key ${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        "x-folder-id": this.folderId,
      },
      body: JSON.stringify({
        modelUri,
        text: input,
        // dim: request.dimensions || EMBEDDINGS_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Yandex Embeddings API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = (await response.json()) as { embedding: number[]; numTokens: string; modelVersion: string };

    return {
      embedding: data.embedding,
      metadata: {
        usage: {
          inputTokens: parseInt(data.numTokens, 10),
          outputTokens: 0,
        },
      },
    };
  }

  async stopRequest(requestId: string, modelId: string): Promise<void> {
    // Yandex FM does not support request cancellation
    throw new Error("Request cancellation is not supported by Yandex FM");
  }
}
