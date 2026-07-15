import { MessageRole, ModelType, ApiProvider } from "../../../types/api";
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
  getFileContentBase64: jest.fn().mockResolvedValue("UERGREFUQQ=="),
  getFileContent: jest.fn().mockResolvedValue(Buffer.from("plain text content", "utf-8")),
} as unknown as FileContentLoader;

const baseRequest: CompleteChatRequest = {
  apiProvider: ApiProvider.OPEN_AI,
  modelId: "gpt-4o-mini",
  modelType: ModelType.CHAT,
  modelFeatures: [],
  settings: {},
};

const completionResponse = (message: Record<string, unknown>) => ({
  choices: [{ message }],
  usage: { prompt_tokens: 10, completion_tokens: 20 },
});

describe("OpenAI completions inline file support", () => {
  let protocol: OpenAICompletionsProtocol;

  beforeEach(() => {
    jest.clearAllMocks();
    protocol = new OpenAICompletionsProtocol({
      baseURL: "https://api.openai.com/v1",
      apiKey: "test-key",
      fileLoader,
    });
  });

  const fileMessages = (mimeType: string, uploadFileName: string): ModelMessage[] => [
    {
      role: MessageRole.USER,
      body: [
        { contentType: "text", content: "Check the attachment" },
        { contentType: "file", fileName: "chat/msg/1.bin", mimeType, uploadFileName },
      ],
    },
  ];

  it("should format PDF attachments as file blocks for vision-capable models", async () => {
    getMockCreate(protocol).mockResolvedValue(completionResponse({ content: "done" }));

    await protocol.completeChat(baseRequest, fileMessages("application/pdf", "report.pdf"));

    const params = getMockCreate(protocol).mock.calls[0][0] as OpenAI.Chat.Completions.ChatCompletionCreateParams;
    const content = params.messages[0].content as OpenAI.Chat.Completions.ChatCompletionContentPart[];
    expect(content).toEqual([
      { type: "text", text: "Check the attachment" },
      {
        type: "file",
        file: {
          filename: "report.pdf",
          file_data: "data:application/pdf;base64,UERGREFUQQ==",
        },
      },
    ]);
  });

  it("should inline textual attachments as plain text parts", async () => {
    getMockCreate(protocol).mockResolvedValue(completionResponse({ content: "done" }));

    await protocol.completeChat(baseRequest, fileMessages("text/plain", "notes.txt"));

    const params = getMockCreate(protocol).mock.calls[0][0] as OpenAI.Chat.Completions.ChatCompletionCreateParams;
    const content = params.messages[0].content as OpenAI.Chat.Completions.ChatCompletionContentPart[];
    expect(content).toEqual([
      { type: "text", text: "Check the attachment" },
      { type: "text", text: 'File "notes.txt":\n\nplain text content' },
    ]);
  });

  it("should skip PDF attachments for models without vision/file support", async () => {
    getMockCreate(protocol).mockResolvedValue(completionResponse({ content: "done" }));

    await protocol.completeChat(
      { ...baseRequest, modelId: "gpt-3.5-turbo" },
      fileMessages("application/pdf", "report.pdf")
    );

    const params = getMockCreate(protocol).mock.calls[0][0] as OpenAI.Chat.Completions.ChatCompletionCreateParams;
    const content = params.messages[0].content as OpenAI.Chat.Completions.ChatCompletionContentPart[];
    expect(content).toEqual([{ type: "text", text: "Check the attachment" }]);
  });
});
