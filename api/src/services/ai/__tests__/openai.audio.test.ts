import { MessageRole, ModelType, ApiProvider, ModelFeature } from "../../../types/api";
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

  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
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

import OpenAI from "openai";
import { OpenAICompletionsProtocol } from "../protocols/openai.completions.protocol";
import { FileContentLoader } from "../../data";

const getMockCreate = (protocol: OpenAICompletionsProtocol): jest.Mock =>
  (protocol as any).openai.chat.completions.create as jest.Mock;

const fileLoader = {
  getFileContentBase64: jest.fn().mockResolvedValue("QUJDRA=="),
} as unknown as FileContentLoader;

const baseRequest: CompleteChatRequest = {
  apiProvider: ApiProvider.OPEN_AI,
  modelId: "gpt-4o-audio-preview",
  modelType: ModelType.AUDIO_GENERATION,
  modelFeatures: [ModelFeature.AUDIO_INPUT, ModelFeature.AUDIO_OUTPUT],
  settings: {},
};

describe("OpenAI completions audio support", () => {
  let protocol: OpenAICompletionsProtocol;

  beforeEach(() => {
    jest.clearAllMocks();
    protocol = new OpenAICompletionsProtocol({
      baseURL: "https://api.openai.com/v1",
      apiKey: "test-key",
      fileLoader,
    });
  });

  const completionResponse = (message: Record<string, unknown>) => ({
    choices: [{ message }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  });

  it("should request text+audio modalities with the default voice for audio models", async () => {
    getMockCreate(protocol).mockResolvedValue(completionResponse({ content: "hello" }));

    await protocol.completeChat(baseRequest, [{ role: MessageRole.USER, body: "Hi" }]);

    const params = getMockCreate(protocol).mock.calls[0][0] as OpenAI.Chat.Completions.ChatCompletionCreateParams;
    expect(params.modalities).toEqual(["text", "audio"]);
    expect(params.audio).toEqual({ voice: "shimmer", format: "mp3" });
  });

  it("should use the chat voice setting when provided", async () => {
    getMockCreate(protocol).mockResolvedValue(completionResponse({ content: "hello" }));

    await protocol.completeChat({ ...baseRequest, settings: { voice: "echo" } }, [
      { role: MessageRole.USER, body: "Hi" },
    ]);

    const params = getMockCreate(protocol).mock.calls[0][0] as OpenAI.Chat.Completions.ChatCompletionCreateParams;
    expect(params.audio).toEqual({ voice: "echo", format: "mp3" });
  });

  it("should not request audio modalities for regular chat models", async () => {
    getMockCreate(protocol).mockResolvedValue(completionResponse({ content: "hello" }));

    await protocol.completeChat(
      { ...baseRequest, modelId: "gpt-4o-mini", modelType: ModelType.CHAT, modelFeatures: [] },
      [{ role: MessageRole.USER, body: "Hi" }]
    );

    const params = getMockCreate(protocol).mock.calls[0][0] as OpenAI.Chat.Completions.ChatCompletionCreateParams;
    expect(params.modalities).toBeUndefined();
    expect(params.audio).toBeUndefined();
  });

  it("should format user voice recordings as input_audio parts", async () => {
    getMockCreate(protocol).mockResolvedValue(completionResponse({ content: "transcribed" }));

    const messages: ModelMessage[] = [
      {
        role: MessageRole.USER,
        body: [
          { contentType: "text", content: "Listen to this" },
          { contentType: "audio", fileName: "chat/msg/voice.wav", mimeType: "audio/wav" },
        ],
      },
    ];

    await protocol.completeChat(baseRequest, messages);

    const params = getMockCreate(protocol).mock.calls[0][0] as OpenAI.Chat.Completions.ChatCompletionCreateParams;
    const userMessage = params.messages.find(m => m.role === "user");
    expect(userMessage).toBeDefined();
    expect(userMessage!.content).toEqual([
      { type: "text", text: "Listen to this" },
      { type: "input_audio", input_audio: { data: "QUJDRA==", format: "wav" } },
    ]);
  });

  it("should NOT replay assistant audio parts as input_audio", async () => {
    getMockCreate(protocol).mockResolvedValue(completionResponse({ content: "ok" }));

    const messages: ModelMessage[] = [
      {
        role: MessageRole.ASSISTANT,
        body: [
          { contentType: "text", content: "Previous voice answer" },
          { contentType: "audio", fileName: "chat/msg/answer.mp3", mimeType: "audio/mpeg" },
        ],
      },
      { role: MessageRole.USER, body: "Continue" },
    ];

    await protocol.completeChat(baseRequest, messages);

    const params = getMockCreate(protocol).mock.calls[0][0] as OpenAI.Chat.Completions.ChatCompletionCreateParams;
    const assistantMessage = params.messages.find(m => m.role === "assistant");
    expect(assistantMessage).toBeDefined();
    expect(assistantMessage!.content).toEqual([{ type: "text", text: "Previous voice answer" }]);
  });

  it("should stream pcm16 speech deltas and return them as a wav audio", async () => {
    const pcmChunk = Buffer.from([0, 0, 255, 127]).toString("base64");
    const chunks = [
      { choices: [{ delta: { audio: { transcript: "Hel" } } }] },
      { choices: [{ delta: { audio: { transcript: "lo", data: pcmChunk } } }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
    ];
    const stream = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [Symbol.asyncIterator]: async function* (): AsyncGenerator<any> {
        for (const chunk of chunks) yield chunk;
      },
      controller: { abort: jest.fn() },
    };
    getMockCreate(protocol).mockResolvedValue(stream);

    const onProgress = jest.fn().mockResolvedValue(false);
    const onComplete = jest.fn().mockResolvedValue(undefined);
    await protocol.streamChatCompletion(baseRequest, [{ role: MessageRole.USER, body: "Hi" }], {
      onStart: jest.fn().mockResolvedValue(false),
      onProgress,
      onComplete,
      onError: jest.fn().mockResolvedValue(false),
    });

    const params = getMockCreate(protocol).mock.calls[0][0] as OpenAI.Chat.Completions.ChatCompletionCreateParams;
    expect(params.audio?.format).toBe("pcm16");

    const response = onComplete.mock.calls[0][0];
    expect(response.content).toBe("Hello");
    expect(response.audios).toHaveLength(1);
    expect(response.audios[0]).toMatch(/^data:audio\/wav;base64,/);
  });

  it("should map response speech audio to audios with the transcript as content", async () => {
    getMockCreate(protocol).mockResolvedValue(
      completionResponse({ content: null, audio: { data: "bXAzZGF0YQ==", transcript: "Spoken answer" } })
    );

    const result = await protocol.completeChat(baseRequest, [{ role: MessageRole.USER, body: "Hi" }]);

    expect(result.content).toBe("Spoken answer");
    expect(result.audios).toEqual(["data:audio/mpeg;base64,bXAzZGF0YQ=="]);
  });
});
