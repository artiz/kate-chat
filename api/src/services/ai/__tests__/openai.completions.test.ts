import { MessageRole, ModelType, ApiProvider } from "../../../types/api";
import { CompleteChatRequest, MessageMetadata, ModelMessage, StreamCallbacks } from "../../../types/ai.types";

jest.mock("../tools/mcp.client", () => ({
  MCPClient: {
    connect: jest.fn(),
  },
}));

jest.mock("../../../services/mcp.service", () => ({}));

jest.mock("openai", () => {
  const mockCreate = jest.fn();

  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
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

import { OpenAICompletionsProtocol } from "../protocols/openai.completions.protocol";

const getMockCreate = (protocol: OpenAICompletionsProtocol): jest.Mock =>
  (protocol as any).openai.chat.completions.create as jest.Mock;

const messages: ModelMessage[] = [{ role: MessageRole.USER, body: "Новости о дизеле" }];

const request: CompleteChatRequest = {
  apiProvider: ApiProvider.OPEN_AI,
  modelId: "gpt-4.1",
  modelType: ModelType.CHAT,
  settings: { maxTokens: 2048 },
};

const chunk = (delta: Record<string, unknown>, finish_reason: string | null = null) => ({
  id: "chatcmpl_1",
  choices: [{ index: 0, delta, finish_reason }],
});

const streamOf = (events: unknown[]) => ({
  controller: { abort: jest.fn() },
  [Symbol.asyncIterator]: async function* () {
    for (const event of events) {
      yield event;
    }
  },
});

const collectStream = async (
  protocol: OpenAICompletionsProtocol
): Promise<{ content?: string; metadata?: MessageMetadata; error?: Error }> => {
  let content: string | undefined;
  let metadata: MessageMetadata | undefined;
  let error: Error | undefined;

  const callbacks: StreamCallbacks = {
    onStart: jest.fn(),
    onProgress: jest.fn().mockResolvedValue(false),
    onComplete: jest.fn().mockImplementation(async response => {
      content = response.content;
      metadata = response.metadata;
    }),
    onError: jest.fn().mockImplementation(async (err: Error) => {
      error = err;
      return false;
    }),
  } as unknown as StreamCallbacks;

  await protocol.streamChatCompletion(request, messages, callbacks);

  return { content, metadata, error };
};

describe("OpenAICompletionsProtocol", () => {
  let protocol: OpenAICompletionsProtocol;

  beforeEach(() => {
    protocol = new OpenAICompletionsProtocol({ baseURL: "https://api.openai.com/v1", apiKey: "test-key" });
    getMockCreate(protocol).mockReset();
  });

  describe("stop reason", () => {
    it("marks an answer cut off by the output limit", async () => {
      getMockCreate(protocol).mockResolvedValue(
        streamOf([chunk({ content: "Аналитик «Финам» ожидает **снижение ц" }), chunk({}, "length")])
      );

      const { content, metadata, error } = await collectStream(protocol);

      expect(error).toBeUndefined();
      expect(content).toBe("Аналитик «Финам» ожидает **снижение ц");
      expect(metadata?.stopReason).toBe("max_tokens");
    });

    it("marks a complete answer as the end of the turn", async () => {
      getMockCreate(protocol).mockResolvedValue(streamOf([chunk({ content: "Готово." }), chunk({}, "stop")]));

      const { metadata } = await collectStream(protocol);

      expect(metadata?.stopReason).toBe("end_turn");
    });

    it("reports the same reason for a synchronous completion", async () => {
      getMockCreate(protocol).mockResolvedValue({
        choices: [{ index: 0, message: { role: "assistant", content: "Половина ответа" }, finish_reason: "length" }],
        usage: { prompt_tokens: 100, completion_tokens: 2048 },
      });

      const { content, metadata } = await protocol.completeChat(request, messages);

      expect(content).toBe("Половина ответа");
      expect(metadata?.stopReason).toBe("max_tokens");
      expect(metadata?.usage?.outputTokens).toBe(2048);
    });
  });
});
