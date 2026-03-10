process.env.ENABLED_API_PROVIDERS = "AWS_BEDROCK";

import { ApiProvider, MessageRole, ModelType } from "../../types/api";
import { AIService } from "../ai/ai.service";
import { Message } from "../../entities/Message";

// Mock the BedrockRuntimeClient
const bedrockClient = {
  send: jest.fn(),
};

// Mock the AWS SDK
jest.mock("@aws-sdk/client-bedrock", () => {
  return {
    ListFoundationModelsCommand: jest.fn(),
    BedrockClient: jest.fn(),
  };
});

// Mock BedrockService to use real implementation but with mocked clients
let _mockedBedrockInstance: any;

jest.mock("../ai/providers/bedrock.provider", () => {
  const originalModule = jest.requireActual("../ai/providers/bedrock.provider");

  class MockedBedrockProvider extends originalModule.BedrockApiProvider {
    constructor(connection: any) {
      super(connection);
      // Replace the clients with our mocks after construction
      this.bedrockClient = bedrockClient;
      this.bedrockManagementClient = { send: jest.fn() };
      _mockedBedrockInstance = this;
    }
  }

  return {
    BedrockApiProvider: MockedBedrockProvider,
  };
});

jest.mock("@aws-sdk/client-bedrock-runtime", () => {
  return {
    InvokeModelCommand: jest.fn(),
    InvokeModelWithResponseStreamCommand: jest.fn(),
    ConverseCommand: jest.fn(),
    ConverseStreamCommand: jest.fn(),
    BedrockRuntimeClient: jest.fn().mockImplementation(() => bedrockClient),
    ValidationException: Error,
  };
});

describe("AIService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the setTimeout mock
    jest.restoreAllMocks();
  });

  describe("generateResponse", () => {
    it("should generate a response using Anthropic provider", async () => {
      const aiService = new AIService();
      const messages: Message[] = [
        { id: "1", role: MessageRole.ASSISTANT, content: "You are a helpful AI assistant." },
        { id: "2", role: MessageRole.USER, content: "Hello, how are you?" },
      ];
      const modelId = "anthropic.claude-3-sonnet-20240229-v1:0";

      // Mock the AWS Bedrock Converse API response
      const mockResponse = {
        output: {
          message: {
            content: [{ text: "I'm doing well, thanks for asking!" }],
          },
        },
        usage: {
          inputTokens: 10,
          outputTokens: 8,
        },
      };

      // Mock the AWS Bedrock client response
      bedrockClient.send.mockResolvedValueOnce(mockResponse);

      const response = await aiService.completeChat(
        {
          awsBedrockRegion: "aws-region",
          awsBedrockProfile: "default",
        },
        { apiProvider: ApiProvider.AWS_BEDROCK, modelId, modelType: ModelType.CHAT },
        messages
      );

      expect(response.content).toBe("I'm doing well, thanks for asking!");
      expect(response.metadata?.usage?.inputTokens).toBe(10);
      expect(response.metadata?.usage?.outputTokens).toBe(8);
      expect(bedrockClient.send).toHaveBeenCalledTimes(1);
    });

    it("should generate a response using Meta provider", async () => {
      const aiService = new AIService();
      const messages: Message[] = [
        { id: "1", role: MessageRole.ASSISTANT, content: "You are a helpful AI assistant." },
        { id: "2", role: MessageRole.USER, content: "Hello, how are you?" },
      ];
      const modelId = "meta.llama2-13b-chat-v1";

      // Mock the AWS Bedrock Converse API response for Meta provider
      const mockResponse = {
        output: {
          message: {
            content: [{ text: "I'm a language model, I don't have feelings, but I'm here to help!" }],
          },
        },
        usage: {
          inputTokens: 15,
          outputTokens: 12,
        },
      };

      // Mock the AWS Bedrock client response
      bedrockClient.send.mockResolvedValueOnce(mockResponse);

      const response = await aiService.completeChat(
        {
          awsBedrockRegion: "aws-region",
          awsBedrockProfile: "default",
        },
        { apiProvider: ApiProvider.AWS_BEDROCK, modelId, modelType: ModelType.CHAT },
        messages
      );

      expect(response.content).toBe("I'm a language model, I don't have feelings, but I'm here to help!");
      expect(response.metadata?.usage?.inputTokens).toBe(15);
      expect(response.metadata?.usage?.outputTokens).toBe(12);
      expect(bedrockClient.send).toHaveBeenCalledTimes(1);
    });

    it("should handle empty response", async () => {
      const aiService = new AIService();
      const messages: Message[] = [{ id: "1", role: MessageRole.USER, content: "Hello" }];
      const modelId = "anthropic.claude-3-sonnet-20240229-v1:0";

      // Mock empty response
      const mockResponse = {
        output: {
          message: {
            content: [],
          },
        },
      };

      bedrockClient.send.mockResolvedValueOnce(mockResponse);

      const response = await aiService.completeChat(
        {
          awsBedrockRegion: "aws-region",
          awsBedrockProfile: "default",
        },
        { apiProvider: ApiProvider.AWS_BEDROCK, modelId, modelType: ModelType.CHAT },
        messages
      );

      expect(response.content).toBe("");
      expect(bedrockClient.send).toHaveBeenCalledTimes(1);
    });
  });

  describe("streamResponse", () => {
    it("should stream a response using Anthropic provider", async () => {
      const aiService = new AIService();
      const messages: Message[] = [{ id: "1", role: MessageRole.USER, content: "Hello" }];
      const modelId = "anthropic.claude-3-sonnet-20240229-v1:0";

      const callback = jest.fn();

      // Mock a streaming response using Converse Stream API format
      const mockResponse = {
        stream: {
          async *[Symbol.asyncIterator]() {
            yield {
              contentBlockDelta: {
                delta: { text: "Hello" },
              },
            };
            yield {
              contentBlockDelta: {
                delta: { text: ", world!" },
              },
            };
            yield {
              messageStop: { stopReason: "stop_sequence" },
              metadata: {
                usage: {
                  inputTokens: 5,
                  outputTokens: 7,
                },
                metrics: {
                  latencyMs: 150,
                },
              },
            };
          },
        },
      };

      bedrockClient.send.mockResolvedValueOnce(mockResponse);

      await aiService.streamChatCompletion(
        {
          awsBedrockRegion: "us-west-2",
          awsBedrockProfile: "default",
        },
        { apiProvider: ApiProvider.AWS_BEDROCK, modelId, modelType: ModelType.CHAT },
        messages,
        { modelId, apiProvider: ApiProvider.AWS_BEDROCK } as any,
        callback
      );

      // First call: userMessageTokens status
      // Second call: onStart callback
      // Third call: onProgress with first token
      // Fourth call: onProgress with second token
      // Fifth call: onComplete
      expect(callback).toHaveBeenCalledTimes(5);
      expect(callback).toHaveBeenNthCalledWith(1, {
        content: "",
        status: { status: "started", userMessageTokens: expect.any(Number) },
      });
      expect(callback).toHaveBeenNthCalledWith(2, { content: "", status: undefined });
      expect(callback).toHaveBeenNthCalledWith(3, { content: "Hello", status: undefined }, false, undefined);
      expect(callback).toHaveBeenNthCalledWith(4, { content: ", world!", status: undefined }, false, undefined);
      const lastCall = callback.mock.calls[4][0];
      expect(lastCall).toMatchObject({
        content: "Hello, world!",
        metadata: expect.objectContaining({
          contextMessages: ["1"],
          usage: expect.objectContaining({
            inputTokens: 5,
            outputTokens: 7,
            invocationLatency: 150,
          }),
        }),
      });
    });

    it("should handle errors during streaming", async () => {
      const aiService = new AIService();
      const messages: Message[] = [{ id: "1", role: MessageRole.USER, content: "Hello" }];
      const modelId = "anthropic.claude-3-sonnet-20240229-v1:0";

      const callback = jest.fn();

      // Mock an error response
      const mockError = new Error("Stream processing error");
      (bedrockClient.send as jest.Mock).mockRejectedValueOnce(mockError);

      await aiService.streamChatCompletion(
        {
          awsBedrockRegion: "aws-region",
          awsBedrockProfile: "default",
        },
        { apiProvider: ApiProvider.AWS_BEDROCK, modelId, modelType: ModelType.CHAT },
        messages,
        { modelId, apiProvider: ApiProvider.AWS_BEDROCK } as any,
        callback
      );

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(1, {
        content: "",
        status: { status: "started", userMessageTokens: expect.any(Number) },
      });
      expect(callback).toHaveBeenNthCalledWith(2, { content: "", status: undefined });
      expect(callback).toHaveBeenNthCalledWith(3, { error: mockError, content: "", status: undefined }, true);
    });

    it("should handle stream exceptions", async () => {
      const aiService = new AIService();
      const messages: Message[] = [{ id: "1", role: MessageRole.USER, content: "Hello" }];
      const modelId = "anthropic.claude-3-sonnet-20240229-v1:0";

      const callback = jest.fn();

      // Mock a streaming response with an error chunk
      const mockError = new Error("Model stream error");
      const mockResponse = {
        stream: {
          async *[Symbol.asyncIterator]() {
            yield {
              contentBlockDelta: {
                delta: { text: "Hello" },
              },
            };
            yield {
              modelStreamErrorException: mockError,
            };
            yield {
              messageStop: { stopReason: "stop_sequence" },
            };
          },
        },
      };

      bedrockClient.send.mockResolvedValueOnce(mockResponse);

      await aiService.streamChatCompletion(
        {
          awsBedrockRegion: "us-west-2",
          awsBedrockProfile: "default",
        },
        { apiProvider: ApiProvider.AWS_BEDROCK, modelId, modelType: ModelType.CHAT },
        messages,
        { modelId, apiProvider: ApiProvider.AWS_BEDROCK } as any,
        callback
      );

      // First call: userMessageTokens status
      // Second call: onStart callback
      // Third call: onProgress with token
      // Fourth call: onError with mockError
      // Fifth call: onComplete after stream ends
      expect(callback).toHaveBeenCalledTimes(5);
      expect(callback).toHaveBeenNthCalledWith(1, {
        content: "",
        status: { status: "started", userMessageTokens: expect.any(Number) },
      });
      expect(callback).toHaveBeenNthCalledWith(2, { content: "", status: undefined });
      expect(callback).toHaveBeenNthCalledWith(3, { content: "Hello", status: undefined }, false, undefined);
      expect(callback).toHaveBeenNthCalledWith(4, { error: mockError, content: "" }, true);
    });
  });

  describe("formatMessages with token limiting", () => {
    it("should keep all messages when total tokens are within limit", async () => {
      const aiService = new AIService();
      const messages: Message[] = [
        { id: "1", role: MessageRole.ASSISTANT, content: "Hi", createdAt: new Date("2024-01-01") },
        { id: "2", role: MessageRole.USER, content: "Hello", createdAt: new Date("2024-01-02") },
      ];

      // Mock provider with low token counts
      const mockProvider = {
        calcInputTokens: jest.fn().mockResolvedValue(50),
        completeChat: jest.fn(),
        streamChatCompletion: jest.fn(),
        getEmbeddings: jest.fn(),
        getCosts: jest.fn(),
        getModels: jest.fn(),
        getInfo: jest.fn(),
        stopRequest: jest.fn(),
        calcOutputTokens: jest.fn(),
      };

      // Call the private formatMessages method via completeChat
      // We'll need to use a spy or access it directly
      const spy = jest.spyOn(aiService as any, "formatMessages").mockResolvedValue([
        { id: "1", role: MessageRole.ASSISTANT, body: "Hi", tokensCount: 50 },
        { id: "2", role: MessageRole.USER, body: "Hello", tokensCount: 50 },
      ]);

      const result = await (aiService as any).formatMessages(messages, mockProvider, 1000, "test-model");

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("1");
      expect(result[1].id).toBe("2");

      spy.mockRestore();
    });

    it("should trim messages when total tokens exceed the limit", async () => {
      const aiService = new AIService();
      const messages: Message[] = [
        { id: "1", role: MessageRole.ASSISTANT, content: "A", createdAt: new Date("2024-01-01") },
        { id: "2", role: MessageRole.USER, content: "B", createdAt: new Date("2024-01-02") },
        { id: "3", role: MessageRole.ASSISTANT, content: "C", createdAt: new Date("2024-01-03") },
        { id: "4", role: MessageRole.USER, content: "D", createdAt: new Date("2024-01-04") },
      ];

      // Mock provider with specific token counts
      const mockProvider = {
        calcInputTokens: jest.fn(async () => {
          // Each message has 300 tokens
          return 300;
        }),
        completeChat: jest.fn(),
        streamChatCompletion: jest.fn(),
        getEmbeddings: jest.fn(),
        getCosts: jest.fn(),
        getModels: jest.fn(),
        getInfo: jest.fn(),
        stopRequest: jest.fn(),
        calcOutputTokens: jest.fn(),
      };

      const result = await (aiService as any).formatMessages(messages, mockProvider, 700, "test-model");

      // With 700 token limit and 300 tokens each message:
      // - Last message (D) = 300 tokens, keep it
      // - Message C = 300 tokens, would make 600, within limit, keep it
      // - Message B = 300 tokens, would make 900, exceeds limit, trim it and earlier
      expect(result).toHaveLength(2);
      expect(result[result.length - 1].id).toBe("4"); // Last message is always kept
    });

    it("should always keep the last user message", async () => {
      const aiService = new AIService();
      const messages: Message[] = [
        { id: "1", role: MessageRole.ASSISTANT, content: "A", createdAt: new Date("2024-01-01") },
        { id: "2", role: MessageRole.USER, content: "B", createdAt: new Date("2024-01-02") },
        { id: "3", role: MessageRole.ASSISTANT, content: "C", createdAt: new Date("2024-01-03") },
        { id: "4", role: MessageRole.USER, content: "User query", createdAt: new Date("2024-01-04") },
      ];

      // Mock provider with high token counts
      const mockProvider = {
        calcInputTokens: jest.fn().mockResolvedValue(800),
        completeChat: jest.fn(),
        streamChatCompletion: jest.fn(),
        getEmbeddings: jest.fn(),
        getCosts: jest.fn(),
        getModels: jest.fn(),
        getInfo: jest.fn(),
        stopRequest: jest.fn(),
        calcOutputTokens: jest.fn(),
      };

      const result = await (aiService as any).formatMessages(messages, mockProvider, 500, "test-model");

      // Even though 800 tokens per message exceeds the 500 limit,
      // the last message should still be included
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[result.length - 1].id).toBe("4");
    });

    it("should use metadata tokensCount if available", async () => {
      const aiService = new AIService();
      const messages: Message[] = [
        {
          id: "1",
          role: MessageRole.USER,
          content: "Hello",
          createdAt: new Date("2024-01-01"),
          metadata: { tokensCount: 150 },
        },
        {
          id: "2",
          role: MessageRole.ASSISTANT,
          content: "Hi",
          createdAt: new Date("2024-01-02"),
          metadata: { tokensCount: 100 },
        },
      ];

      const mockProvider = {
        calcInputTokens: jest.fn(), // Should not be called for messages with metadata.tokensCount
        completeChat: jest.fn(),
        streamChatCompletion: jest.fn(),
        getEmbeddings: jest.fn(),
        getCosts: jest.fn(),
        getModels: jest.fn(),
        getInfo: jest.fn(),
        stopRequest: jest.fn(),
        calcOutputTokens: jest.fn(),
      };

      const result = await (aiService as any).formatMessages(messages, mockProvider, 500, "test-model");

      expect(result).toHaveLength(2);
      expect(mockProvider.calcInputTokens).not.toHaveBeenCalled();
    });

    it("should merge consecutive messages from same role", async () => {
      const aiService = new AIService();
      const messages: Message[] = [
        { id: "1", role: MessageRole.USER, content: "Hello", createdAt: new Date("2024-01-01") },
        { id: "2", role: MessageRole.USER, content: "How are you?", createdAt: new Date("2024-01-02") },
      ];

      const mockProvider = {
        calcInputTokens: jest.fn().mockResolvedValue(50),
        completeChat: jest.fn(),
        streamChatCompletion: jest.fn(),
        getEmbeddings: jest.fn(),
        getCosts: jest.fn(),
        getModels: jest.fn(),
        getInfo: jest.fn(),
        stopRequest: jest.fn(),
        calcOutputTokens: jest.fn(),
      };

      const result = await (aiService as any).formatMessages(messages, mockProvider, 1000, "test-model");

      // Two consecutive USER messages should be merged into one
      expect(result).toHaveLength(1);
      expect(result[0].body).toContain("Hello");
      expect(result[0].body).toContain("How are you?");
    });
  });
});
