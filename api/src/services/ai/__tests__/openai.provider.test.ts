import { ApiProvider, MessageRole, ModelType, CredentialSourceType } from "../../../types/api";
import { CompleteChatRequest, ModelMessage } from "../../../types/ai.types";

jest.mock("../tools/mcp.client", () => ({
  MCPClient: {
    connect: jest.fn(),
  },
}));

jest.mock("../../../services/mcp.service", () => ({}));

// Mock the openai module before importing anything that uses it
jest.mock("openai", () => {
  const mockCreate = jest.fn();
  const mockList = jest.fn();
  const mockCancel = jest.fn();
  const mockEmbeddingsCreate = jest.fn();

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
      models: {
        list: mockList,
      },
      embeddings: {
        create: mockEmbeddingsCreate,
      },
      baseURL: "https://api.openai.com/v1",
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
    openai: {
      apiUrl: "https://api.openai.com/v1",
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

import { OpenAIApiProvider } from "../providers/openai.provider";
import OpenAI from "openai";

function getMockOpenAI(provider: OpenAIApiProvider): jest.Mocked<OpenAI> {
  return (provider as any).protocol.openai as jest.Mocked<OpenAI>;
}

const baseConnection = {
  openAiApiKey: "test-key",
  openAiApiAdminKey: "",
};

describe("OpenAIApiProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("creates a completions protocol for regular models", () => {
      const provider = new OpenAIApiProvider(baseConnection as any);
      expect((provider as any).protocol.type).toBe("completions");
    });

    it("creates a responses protocol for models in OPENAI_MODELS_SUPPORT_RESPONSES_API", () => {
      const provider = new OpenAIApiProvider(baseConnection as any, undefined, "o3");
      expect((provider as any).protocol.type).toBe("responses");
    });

    it("creates a completions protocol when no modelId given", () => {
      const provider = new OpenAIApiProvider(baseConnection as any);
      expect((provider as any).protocol.type).toBe("completions");
    });
  });

  describe("completeChat", () => {
    it("delegates text chat to protocol and returns response", async () => {
      const provider = new OpenAIApiProvider(baseConnection as any);
      const mockOpenAI = getMockOpenAI(provider);
      (mockOpenAI.chat.completions.create as jest.Mock).mockResolvedValue({
        choices: [{ message: { content: "Hello!" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const request: CompleteChatRequest = {
        apiProvider: ApiProvider.OPEN_AI,
        modelId: "gpt-3.5-turbo",
        modelType: ModelType.CHAT,
        settings: {},
      };
      const messages: ModelMessage[] = [{ id: "1", role: MessageRole.USER, body: "Hi" }];

      const result = await provider.completeChat(request, messages);
      expect(result.content).toBe("Hello!");
      expect(result.metadata?.usage?.inputTokens).toBe(10);
      expect(result.metadata?.usage?.outputTokens).toBe(5);
    });

    it("calls generateImages for IMAGE_GENERATION model type", async () => {
      const provider = new OpenAIApiProvider(baseConnection as any);
      const generateImagesSpy = jest
        .spyOn(provider as any, "generateImages")
        .mockResolvedValue({ images: ["base64data"] });

      const request: CompleteChatRequest = {
        apiProvider: ApiProvider.OPEN_AI,
        modelId: "dall-e-3",
        modelType: ModelType.IMAGE_GENERATION,
        settings: {},
      };
      const messages: ModelMessage[] = [{ id: "1", role: MessageRole.USER, body: "A cat" }];

      const result = await provider.completeChat(request, messages);
      expect(generateImagesSpy).toHaveBeenCalled();
      expect(result.images).toEqual(["base64data"]);
    });
  });

  describe("getInfo", () => {
    it("returns connected=true when API key is set", async () => {
      const provider = new OpenAIApiProvider(baseConnection as any);
      const info = await provider.getInfo();
      expect(info.id).toBe(ApiProvider.OPEN_AI);
      expect(info.isConnected).toBe(true);
    });

    it("returns connected=false when API key is missing", async () => {
      const provider = new OpenAIApiProvider({ openAiApiKey: "", openAiApiAdminKey: "" } as any);
      const info = await provider.getInfo();
      expect(info.isConnected).toBe(false);
    });

    it("checks connection when checkConnection=true", async () => {
      const provider = new OpenAIApiProvider(baseConnection as any);
      const mockOpenAI = getMockOpenAI(provider);
      (mockOpenAI.models.list as jest.Mock).mockResolvedValue({ data: [] });

      const info = await provider.getInfo(true);
      expect(mockOpenAI.models.list).toHaveBeenCalled();
      expect(info.details?.status).toBe("OK");
    });

    it("sets isConnected=false when connection check fails", async () => {
      const provider = new OpenAIApiProvider(baseConnection as any);
      const mockOpenAI = getMockOpenAI(provider);
      (mockOpenAI.models.list as jest.Mock).mockRejectedValue(new Error("Network error"));

      const info = await provider.getInfo(true);
      expect(info.isConnected).toBe(false);
    });
  });

  describe("getModels", () => {
    it("returns empty object when protocol is not initialized", async () => {
      const provider = new OpenAIApiProvider({ openAiApiKey: "" } as any);
      const models = await provider.getModels([ModelType.CHAT], "ENVIRONMENT" as CredentialSourceType);
      expect(models).toEqual({});
    });

    it("returns chat models from OpenAI API", async () => {
      const provider = new OpenAIApiProvider(baseConnection as any);
      const mockOpenAI = getMockOpenAI(provider);
      (mockOpenAI.models.list as jest.Mock).mockResolvedValue({
        data: [{ id: "gpt-4o", object: "model", created: 0, owned_by: "openai" }],
      });

      const models = await provider.getModels([ModelType.CHAT], "ENVIRONMENT" as CredentialSourceType);
      expect(models["gpt-4o"]).toBeDefined();
      expect(models["gpt-4o"].type).toBe(ModelType.CHAT);
      expect(models["gpt-4o"].apiProvider).toBe(ApiProvider.OPEN_AI);
    });

    it("filters out embedding models when only CHAT type is requested", async () => {
      const provider = new OpenAIApiProvider(baseConnection as any);
      const mockOpenAI = getMockOpenAI(provider);
      (mockOpenAI.models.list as jest.Mock).mockResolvedValue({
        data: [
          { id: "gpt-4o", object: "model", created: 0, owned_by: "openai" },
          { id: "text-embedding-ada-002", object: "model", created: 0, owned_by: "openai" },
        ],
      });

      const models = await provider.getModels([ModelType.CHAT], "ENVIRONMENT" as CredentialSourceType);
      expect(models["gpt-4o"]).toBeDefined();
      expect(models["text-embedding-ada-002"]).toBeUndefined();
    });
  });

  describe("getEmbeddings", () => {
    it("delegates to protocol and returns embeddings", async () => {
      const provider = new OpenAIApiProvider(baseConnection as any);
      const mockOpenAI = getMockOpenAI(provider);
      (mockOpenAI.embeddings.create as jest.Mock).mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { prompt_tokens: 5 },
      });

      const result = await provider.getEmbeddings({ modelId: "text-embedding-3-small", input: "hello" });
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.metadata?.usage?.inputTokens).toBe(5);
    });
  });

  describe("stopRequest", () => {
    it("throws for completions models", async () => {
      const provider = new OpenAIApiProvider(baseConnection as any);
      await expect(provider.stopRequest("req-1", "gpt-3.5-turbo")).rejects.toThrow("Responses API");
    });

    it("cancels request for responses models", async () => {
      const provider = new OpenAIApiProvider(baseConnection as any, undefined, "o3");
      const mockOpenAI = getMockOpenAI(provider);
      (mockOpenAI.responses.cancel as jest.Mock).mockResolvedValue({});

      await provider.stopRequest("req-1", "o3");
      expect(mockOpenAI.responses.cancel).toHaveBeenCalledWith("req-1");
    });
  });
});
