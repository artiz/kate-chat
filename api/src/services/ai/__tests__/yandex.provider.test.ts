import { ApiProvider, MessageRole, ModelType, CredentialSourceType } from "../../../types/api";
import { CompleteChatRequest, ModelMessage } from "../../../types/ai.types";

jest.mock("../tools/mcp.client", () => ({
  MCPClient: {
    connect: jest.fn(),
  },
}));

jest.mock("../../../services/mcp.service", () => ({}));

jest.mock("openai", () => {
  const mockCreate = jest.fn();
  const mockCancel = jest.fn();

  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
      responses: {
        create: mockCreate,
        cancel: mockCancel,
        retrieve: jest.fn(),
      },
      embeddings: {
        create: jest.fn(),
      },
      baseURL: "https://llm.api.cloud.yandex.net/v1",
    })),
    APIError: class APIError extends Error {
      code: string;
      constructor(message: string, code = "") {
        super(message);
        this.code = code;
      }
    },
  };
});

jest.mock("undici", () => ({
  fetch: jest.fn(),
  Agent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("../../../global-config", () => ({
  globalConfig: {
    yandex: {
      openApiUrl: "https://llm.api.cloud.yandex.net/v1",
      fmApiUrl: "https://llm.api.cloud.yandex.net",
      ignoredModels: [],
    },
    ai: {
      charactersPerToken: 3.5,
      reasoningMaxTokenBudget: 10000,
      reasoningMinTokenBudget: 1000,
    },
  },
}));

jest.mock("../../../utils/logger", () => ({
  createLogger: () => ({
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    isLevelEnabled: jest.fn().mockReturnValue(false),
  }),
}));

jest.mock("../tools/yandex.web_search", () => ({
  YandexWebSearch: {
    isAvailable: jest.fn().mockResolvedValue(false),
  },
}));

import { YandexApiProvider } from "../providers/yandex.provider";

const baseConnection = {
  yandexFmApiKey: "test-yandex-key",
  yandexFmApiFolder: "test-folder-id",
};

describe("YandexApiProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("creates completions protocol by default", () => {
      const provider = new YandexApiProvider(baseConnection as any);
      expect((provider as any).protocol.type).toBe("completions");
    });

    it("does not create protocol when API key is missing", () => {
      const provider = new YandexApiProvider({ yandexFmApiKey: "", yandexFmApiFolder: "folder" } as any);
      expect((provider as any).protocol).toBeUndefined();
    });
  });

  describe("completeChat", () => {
    it("throws when API key is not set", async () => {
      const provider = new YandexApiProvider({ yandexFmApiKey: "", yandexFmApiFolder: "" } as any);
      await expect(
        provider.completeChat(
          { apiProvider: ApiProvider.YANDEX_AI, modelId: "m", modelType: ModelType.CHAT } as any,
          []
        )
      ).rejects.toThrow("Yandex API key is not set");
    });

    it("replaces {folder} placeholder in modelId before passing to protocol", async () => {
      const provider = new YandexApiProvider(baseConnection as any);
      const mockProtocol = {
        completeChat: jest.fn().mockResolvedValue({ content: "OK" }),
        type: "completions",
      };
      (provider as any).protocol = mockProtocol;

      const request: CompleteChatRequest = {
        apiProvider: ApiProvider.YANDEX_AI,
        modelId: "gpt://{folder}/yandexgpt/latest",
        modelType: ModelType.CHAT,
        settings: {},
      };

      await provider.completeChat(request, []);

      expect(mockProtocol.completeChat).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: "gpt://test-folder-id/yandexgpt/latest" }),
        []
      );
    });

    it("routes image generation to generateImage method", async () => {
      const provider = new YandexApiProvider(baseConnection as any);
      const generateImageSpy = jest.spyOn(provider as any, "generateImage").mockResolvedValue({ images: ["img-data"] });

      const request: CompleteChatRequest = {
        apiProvider: ApiProvider.YANDEX_AI,
        modelId: "art://{folder}/yandex-art/latest",
        modelType: ModelType.IMAGE_GENERATION,
        settings: {},
      };

      const result = await provider.completeChat(request, []);
      expect(generateImageSpy).toHaveBeenCalled();
      expect(result.images).toEqual(["img-data"]);
    });
  });

  describe("getInfo", () => {
    it("returns connected=true when apiKey and folderId are set", async () => {
      const provider = new YandexApiProvider(baseConnection as any);
      const info = await provider.getInfo();
      expect(info.id).toBe(ApiProvider.YANDEX_AI);
      expect(info.isConnected).toBe(true);
    });

    it("returns connected=false when credentials are missing", async () => {
      const provider = new YandexApiProvider({ yandexFmApiKey: "", yandexFmApiFolder: "" } as any);
      const info = await provider.getInfo();
      expect(info.isConnected).toBe(false);
    });
  });

  describe("getModels", () => {
    it("returns empty object when API key is missing", async () => {
      const provider = new YandexApiProvider({ yandexFmApiKey: "", yandexFmApiFolder: "" } as any);
      const models = await provider.getModels([ModelType.CHAT], "ENVIRONMENT" as CredentialSourceType);
      expect(models).toEqual({});
    });

    it("returns models filtered by allowed types", async () => {
      const provider = new YandexApiProvider(baseConnection as any);
      const models = await provider.getModels([ModelType.CHAT], "ENVIRONMENT" as CredentialSourceType);

      const modelIds = Object.keys(models);
      expect(modelIds.length).toBeGreaterThan(0);

      for (const id of modelIds) {
        expect(models[id].apiProvider).toBe(ApiProvider.YANDEX_AI);
        expect(models[id].type).toBe(ModelType.CHAT);
      }
    });

    it("excludes IMAGE_GENERATION models when only CHAT type allowed", async () => {
      const provider = new YandexApiProvider(baseConnection as any);
      const models = await provider.getModels([ModelType.CHAT], "ENVIRONMENT" as CredentialSourceType);

      for (const id of Object.keys(models)) {
        expect(models[id].type).not.toBe(ModelType.IMAGE_GENERATION);
      }
    });
  });

  describe("getCosts", () => {
    it("returns error message indicating costs unavailable", async () => {
      const provider = new YandexApiProvider(baseConnection as any);
      const result = await provider.getCosts(Date.now() / 1000);
      expect(result.error).toBeDefined();
      expect(result.costs).toEqual([]);
    });
  });

  describe("stopRequest", () => {
    it("throws when protocol is not initialized", async () => {
      const provider = new YandexApiProvider({ yandexFmApiKey: "", yandexFmApiFolder: "" } as any);
      await expect(provider.stopRequest("req-1", "model-id")).rejects.toThrow("OpenAI protocol is not initialized");
    });

    it("throws when protocol is not responses type", async () => {
      const provider = new YandexApiProvider(baseConnection as any);
      // completions protocol by default
      await expect(provider.stopRequest("req-1", "model-id")).rejects.toThrow("Responses API");
    });
  });

  describe("checkImageGeneration", () => {
    it("returns null when operation is not done", async () => {
      const { fetch } = require("undici");
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ done: false }),
      });

      const provider = new YandexApiProvider(baseConnection as any);
      const result = await provider.checkImageGeneration("op-123");
      expect(result).toBeNull();
    });

    it("returns ModelResponse with image when operation is done", async () => {
      const { fetch } = require("undici");
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ done: true, response: { image: "base64image" } }),
      });

      const provider = new YandexApiProvider(baseConnection as any);
      const result = await provider.checkImageGeneration("op-123");
      expect(result?.images).toEqual(["base64image"]);
    });

    it("throws when operation failed", async () => {
      const { fetch } = require("undici");
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ done: true, error: { message: "generation failed", code: 400 } }),
      });

      const provider = new YandexApiProvider(baseConnection as any);
      await expect(provider.checkImageGeneration("op-123")).rejects.toThrow("generation failed");
    });
  });
});
