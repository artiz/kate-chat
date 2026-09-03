import { MessageRole, ModelType, ApiProvider, ModelFeature } from "../../../types/api";
import { CompleteChatRequest, ModelMessage, StreamCallbacks } from "../../../types/ai.types";

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
      responses: {
        create: mockCreate,
        cancel: mockCancel,
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

jest.mock("../../../global-config", () => ({
  globalConfig: {
    openai: {
      apiUrl: "https://api.openai.com/v1",
      ignoredModels: [],
    },
    ai: {
      charactersPerToken: 3.5,
      reasoningMaxTokenBudget: 16_000,
      reasoningMinTokenBudget: 1024,
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

import { OpenAIResponsesProtocol } from "../protocols/openai.responses.protocol";

const getMockCreate = (protocol: OpenAIResponsesProtocol): jest.Mock =>
  (protocol as any).openai.responses.create as jest.Mock;

const messages: ModelMessage[] = [{ role: MessageRole.USER, body: "Write my LinkedIn about" }];

const baseRequest: CompleteChatRequest = {
  apiProvider: ApiProvider.OPEN_AI,
  modelId: "gpt-5",
  modelType: ModelType.CHAT,
  modelFeatures: [ModelFeature.REASONING],
  settings: { maxTokens: 2048 },
};

// Minimal `Response` shape consumed by parseResponsesOutput
const emptyResponse = {
  id: "resp_1",
  output: [],
  usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 },
};

const streamOf = (events: unknown[]) => ({
  controller: { abort: jest.fn() },
  [Symbol.asyncIterator]: async function* () {
    for (const event of events) {
      yield event;
    }
  },
});

const collectStream = async (
  protocol: OpenAIResponsesProtocol,
  request: CompleteChatRequest = baseRequest
): Promise<{ content?: string; error?: Error }> => {
  let content: string | undefined;
  let error: Error | undefined;

  const callbacks: StreamCallbacks = {
    onStart: jest.fn(),
    onProgress: jest.fn().mockResolvedValue(false),
    onComplete: jest.fn().mockImplementation(async response => {
      content = response.content;
    }),
    onError: jest.fn().mockImplementation(async (err: Error) => {
      error = err;
      return false;
    }),
  } as unknown as StreamCallbacks;

  await protocol.streamChatCompletion(request, messages, callbacks);

  return { content, error };
};

describe("OpenAIResponsesProtocol", () => {
  let protocol: OpenAIResponsesProtocol;

  beforeEach(() => {
    protocol = new OpenAIResponsesProtocol({ baseURL: "https://api.openai.com/v1", apiKey: "test-key" });
    getMockCreate(protocol).mockReset();
  });

  describe("max_output_tokens", () => {
    it("reserves reasoning headroom on top of the answer budget for reasoning models", async () => {
      getMockCreate(protocol).mockResolvedValue(emptyResponse);

      await protocol.completeChat(baseRequest, messages);

      // no explicit effort → the API default ("medium") reserve of 0.75 * 16_000
      const [params] = getMockCreate(protocol).mock.calls[0];
      expect(params.max_output_tokens).toBe(2048 + 12_000);
    });

    it("scales the reserve with the requested thinking effort", async () => {
      getMockCreate(protocol).mockResolvedValue(emptyResponse);

      await protocol.completeChat(
        { ...baseRequest, settings: { maxTokens: 2048, thinking: true, thinkingBudget: 16_000 } },
        messages
      );

      const [params] = getMockCreate(protocol).mock.calls[0];
      expect(params.reasoning?.effort).toBe("high");
      expect(params.max_output_tokens).toBe(2048 + 16_000);
    });

    it("leaves the budget untouched for models without reasoning", async () => {
      getMockCreate(protocol).mockResolvedValue(emptyResponse);

      await protocol.completeChat({ ...baseRequest, modelId: "gpt-4o", modelFeatures: [] }, messages);

      const [params] = getMockCreate(protocol).mock.calls[0];
      expect(params.max_output_tokens).toBe(2048);
    });
  });

  describe("streaming without content", () => {
    it("explains an answer cut off by the output budget", async () => {
      getMockCreate(protocol).mockResolvedValue(
        streamOf([
          { type: "response.created", sequence_number: 1, response: { id: "resp_1" } },
          {
            type: "response.incomplete",
            sequence_number: 2,
            response: {
              ...emptyResponse,
              max_output_tokens: 2048,
              incomplete_details: { reason: "max_output_tokens" },
              output: [{ type: "reasoning", summary: [] }],
              usage: { input_tokens: 14_804, output_tokens: 2514, total_tokens: 17_318 },
            },
          },
        ])
      );

      const { content, error } = await collectStream(protocol);

      expect(error).toBeUndefined();
      expect(content).toContain("Raise Max tokens");
    });

    it("reports a failed response as an error", async () => {
      getMockCreate(protocol).mockResolvedValue(
        streamOf([
          { type: "response.created", sequence_number: 1, response: { id: "resp_1" } },
          {
            type: "response.failed",
            sequence_number: 2,
            response: { ...emptyResponse, error: { code: "server_error", message: "upstream exploded" } },
          },
        ])
      );

      const { error } = await collectStream(protocol);

      expect(error?.message).toContain("upstream exploded");
    });

    it("still falls back to a plain no-response marker without a reason", async () => {
      getMockCreate(protocol).mockResolvedValue(
        streamOf([
          { type: "response.created", sequence_number: 1, response: { id: "resp_1" } },
          { type: "response.completed", sequence_number: 2, response: emptyResponse },
        ])
      );

      const { content } = await collectStream(protocol);

      expect(content).toBe("_No response_");
    });

    it("keeps the streamed text when the model does answer", async () => {
      getMockCreate(protocol).mockResolvedValue(
        streamOf([
          { type: "response.created", sequence_number: 1, response: { id: "resp_1" } },
          { type: "response.output_text.delta", sequence_number: 2, delta: "Product-minded engineer" },
          {
            type: "response.completed",
            sequence_number: 3,
            response: {
              ...emptyResponse,
              output: [
                {
                  type: "message",
                  content: [{ type: "output_text", text: "Product-minded engineer" }],
                },
              ],
            },
          },
        ])
      );

      const { content } = await collectStream(protocol);

      expect(content).toBe("Product-minded engineer");
    });
  });
});
