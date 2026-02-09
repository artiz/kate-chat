process.env.ENABLED_API_PROVIDERS = "AWS_BEDROCK";
import { ApiProvider } from "../../config/ai/common";
import { AIService } from "../ai/ai.service";
import { MessageRole, ModelType } from "../../types/ai.types";
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
let mockedBedrockInstance: any;

jest.mock("../ai/providers/bedrock.provider", () => {
  const originalModule = jest.requireActual("../ai/providers/bedrock.provider");

  class MockedBedrockProvider extends originalModule.BedrockApiProvider {
    constructor(connection: any) {
      super(connection);
      // Replace the clients with our mocks after construction
      this.bedrockClient = bedrockClient;
      this.bedrockManagementClient = { send: jest.fn() };
      mockedBedrockInstance = this;
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
          AWS_BEDROCK_REGION: "aws-region",
          AWS_BEDROCK_PROFILE: "default",
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
          AWS_BEDROCK_REGION: "aws-region",
          AWS_BEDROCK_PROFILE: "default",
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
          AWS_BEDROCK_REGION: "aws-region",
          AWS_BEDROCK_PROFILE: "default",
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
          AWS_BEDROCK_REGION: "us-west-2",
          AWS_BEDROCK_PROFILE: "default",
        },
        { apiProvider: ApiProvider.AWS_BEDROCK, modelId, modelType: ModelType.CHAT },
        messages,
        callback
      );

      expect(callback).toHaveBeenCalledTimes(4);
      expect(callback).toHaveBeenNthCalledWith(1, { content: "", status: undefined, type: "text" });
      expect(callback).toHaveBeenNthCalledWith(
        2,
        { content: "Hello", status: undefined, type: "text" },
        false,
        undefined
      );
      expect(callback).toHaveBeenNthCalledWith(
        3,
        { content: ", world!", status: undefined, type: "text" },
        false,
        undefined
      );
      expect(callback).toHaveBeenNthCalledWith(
        4,
        {
          content: "Hello, world!",
          metadata: {
            usage: {
              inputTokens: 5,
              outputTokens: 7,
              invocationLatency: 150,
            },
          },
          type: "text",
        },
        true
      );
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
          AWS_BEDROCK_REGION: "aws-region",
          AWS_BEDROCK_PROFILE: "default",
        },
        { apiProvider: ApiProvider.AWS_BEDROCK, modelId, modelType: ModelType.CHAT },
        messages,
        callback
      );

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenNthCalledWith(1, { content: "", status: undefined, type: "text" });
      expect(callback).toHaveBeenNthCalledWith(
        2,
        { error: mockError, content: "", status: undefined, type: "text" },
        true
      );
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
          AWS_BEDROCK_REGION: "us-west-2",
          AWS_BEDROCK_PROFILE: "default",
        },
        { apiProvider: ApiProvider.AWS_BEDROCK, modelId, modelType: ModelType.CHAT },
        messages,
        callback
      );

      expect(callback).toHaveBeenCalledTimes(4);
      expect(callback).toHaveBeenNthCalledWith(1, { content: "", status: undefined, type: "text" });
      expect(callback).toHaveBeenNthCalledWith(
        2,
        { content: "Hello", status: undefined, type: "text" },
        false,
        undefined
      );
      expect(callback).toHaveBeenNthCalledWith(3, { error: mockError, content: "", type: "text" }, true);
    });
  });
});
