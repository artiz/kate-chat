import { AIService } from "../ai.service";
import { BedrockService } from "../bedrock/bedrock.service";
import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { MessageRole } from "../../entities/Message";
import { ApiProvider, ModelMessage } from "../../types/ai.types";
import { A21InvokeModelResponse } from "../bedrock/providers/ai21.service";
import { log } from "console";
import { logger } from "../../utils/logger";

// Mock the BedrockRuntimeClient
const bedrockClient = {
  send: jest.fn(),
};

jest.mock("../../config/ai.ts", () => {
  return {
    // values from ApiProvider to avoid circular dependency
    ENABLED_API_PROVIDERS: ["aws_bedrock", "yandex_fm"],
    DEFAULT_TEMPERATURE: 0.7,
    DEFAULT_MAX_TOKENS: 1000,
    DEFAULT_TOP_P: 0.9,
    DEFAULT_PROMPT: "You are a helpful AI assistant.",
    CONTEXT_MESSAGES_LIMIT: 50,
  };
});

// Mock the AWS SDK
jest.mock("@aws-sdk/client-bedrock", () => {
  return {
    ListFoundationModelsCommand: jest.fn(),
    BedrockClient: jest.fn(),
  };
});

// Mock BedrockService to use real implementation but with mocked clients
let mockedBedrockInstance: any;

jest.mock("../bedrock/bedrock.service", () => {
  const originalModule = jest.requireActual("../bedrock/bedrock.service");

  class MockedBedrockService extends originalModule.BedrockService {
    constructor(connection: any) {
      super(connection);
      // Replace the clients with our mocks after construction
      this.bedrockClient = bedrockClient;
      this.bedrockManagementClient = { send: jest.fn() };
      mockedBedrockInstance = this;
    }
  }

  return {
    BedrockService: MockedBedrockService,
  };
});

jest.mock("@aws-sdk/client-bedrock-runtime", () => {
  return {
    InvokeModelCommand: jest.fn(),
    InvokeModelWithResponseStreamCommand: jest.fn(),
    BedrockRuntimeClient: jest.fn().mockImplementation(() => bedrockClient),
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
      const messages: ModelMessage[] = [
        { role: MessageRole.ASSISTANT, body: "You are a helpful AI assistant." },
        { role: MessageRole.USER, body: "Hello, how are you?" },
      ];
      const modelId = "anthropic.claude-3-sonnet-20240229-v1:0";

      // Mock the AWS Bedrock response
      const mockResponse = {
        body: Buffer.from(
          JSON.stringify({
            content: [{ text: "I'm doing well, thanks for asking!" }],
          })
        ),
      };

      // Mock the AWS Bedrock client response
      bedrockClient.send.mockResolvedValueOnce(mockResponse);

      const response = await aiService.invokeModel(
        ApiProvider.AWS_BEDROCK,
        {
          AWS_BEDROCK_REGION: "aws-region",
          AWS_BEDROCK_PROFILE: "default",
        },
        { messages, modelId }
      );

      expect(response.content).toBe("I'm doing well, thanks for asking!");
      expect(InvokeModelCommand).toHaveBeenCalledTimes(1);
      expect(bedrockClient.send).toHaveBeenCalledTimes(1);
    });

    it("should generate a response using Meta provider", async () => {
      const aiService = new AIService();
      const messages: ModelMessage[] = [
        { role: MessageRole.ASSISTANT, body: "You are a helpful AI assistant." },
        { role: MessageRole.USER, body: "Hello, how are you?" },
      ];
      const modelId = "meta.llama2-13b-chat-v1";

      // Mock the AWS Bedrock response for Meta provider
      const mockResponse = {
        body: Buffer.from(
          JSON.stringify({
            generation: "I'm a language model, I don't have feelings, but I'm here to help!",
          })
        ),
      };

      // Mock the AWS Bedrock client response
      bedrockClient.send.mockResolvedValueOnce(mockResponse);

      const response = await aiService.invokeModel(
        ApiProvider.AWS_BEDROCK,
        {
          AWS_BEDROCK_REGION: "aws-region",
          AWS_BEDROCK_PROFILE: "default",
        },
        { messages, modelId }
      );

      expect(response.content).toBe("I'm a language model, I don't have feelings, but I'm here to help!");
      expect(InvokeModelCommand).toHaveBeenCalledTimes(1);
      expect(bedrockClient.send).toHaveBeenCalledTimes(1);
    });

    it("should throw an error for unsupported model provider", async () => {
      const aiService = new AIService();
      const messages: ModelMessage[] = [{ role: MessageRole.USER, body: "Hello" }];
      const modelId = "unknown.model-v1";

      await expect(
        aiService.invokeModel(
          ApiProvider.AWS_BEDROCK,
          {
            AWS_BEDROCK_REGION: "aws-region",
            AWS_BEDROCK_PROFILE: "default",
          },
          { messages, modelId }
        )
      ).rejects.toThrow("Unsupported model provider");
    });
  });

  describe("streamResponse", () => {
    it("should stream a response using Anthropic provider", async () => {
      const aiService = new AIService();
      const messages: ModelMessage[] = [{ role: MessageRole.USER, body: "Hello" }];
      const modelId = "anthropic.claude-3-sonnet-20240229-v1:0";

      const callbacks = {
        onStart: jest.fn(),
        onToken: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      // Mock a streaming response
      const mockResponse = {
        body: {
          async *[Symbol.asyncIterator]() {
            yield {
              chunk: {
                bytes: Buffer.from(
                  JSON.stringify({
                    type: "content_block_delta",
                    delta: { text: "Hello" },
                  })
                ),
              },
            };
            yield {
              chunk: {
                bytes: Buffer.from(
                  JSON.stringify({
                    type: "content_block_delta",
                    delta: { text: ", world!" },
                  })
                ),
              },
            };
          },
        },
      };

      bedrockClient.send.mockResolvedValueOnce(mockResponse);

      await aiService.invokeModelAsync(
        ApiProvider.AWS_BEDROCK,
        {
          AWS_BEDROCK_REGION: "us-west-2",
          AWS_BEDROCK_PROFILE: "default",
        },
        { messages, modelId },
        callbacks
      );

      expect(callbacks.onStart).toHaveBeenCalledTimes(1);
      expect(callbacks.onToken).toHaveBeenCalledTimes(2);
      expect(callbacks.onToken).toHaveBeenNthCalledWith(1, "Hello");
      expect(callbacks.onToken).toHaveBeenNthCalledWith(2, ", world!");
      expect(callbacks.onComplete).toHaveBeenCalledWith("Hello, world!");
      expect(callbacks.onError).not.toHaveBeenCalled();
    });

    it("should simulate streaming for non-streaming models", async () => {
      const aiService = new AIService();
      const messages: ModelMessage[] = [{ role: MessageRole.USER, body: "Hello" }];
      const modelId = "ai21.j2-ultra-v1"; // Non-streaming model

      const callbacks = {
        onStart: jest.fn(),
        onToken: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      // Mock the AWS Bedrock response for the non-streaming model
      const response: A21InvokeModelResponse = {
        choices: [{ message: { role: "assistant", content: "I'm doing well, thanks for asking!" } }],
      };
      const mockResponse = {
        body: Buffer.from(JSON.stringify(response)),
      };

      // Mock the AWS Bedrock client response
      (bedrockClient.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      // Mock the setTimeout to execute immediately
      jest.spyOn(global, "setTimeout").mockImplementation(callback => {
        callback();
        return {} as any;
      });

      await aiService.invokeModelAsync(
        ApiProvider.AWS_BEDROCK,
        {
          AWS_BEDROCK_REGION: "aws-region",
          AWS_BEDROCK_PROFILE: "default",
        },
        { messages, modelId },
        callbacks
      );

      expect(callbacks.onStart).toHaveBeenCalledTimes(1);
      expect(callbacks.onToken).toHaveBeenCalled();
      expect(callbacks.onComplete).toHaveBeenCalledWith("I'm doing well, thanks for asking!");
      expect(callbacks.onError).not.toHaveBeenCalled();
    });

    it("should handle errors during streaming", async () => {
      const aiService = new AIService();
      const messages: ModelMessage[] = [{ role: MessageRole.USER, body: "Hello" }];
      const modelId = "anthropic.claude-3-sonnet-20240229-v1:0";

      const callbacks = {
        onStart: jest.fn(),
        onToken: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      // Mock an error response
      const mockError = new Error("Stream processing error");
      (bedrockClient.send as jest.Mock).mockRejectedValueOnce(mockError);

      await aiService.invokeModelAsync(
        ApiProvider.AWS_BEDROCK,
        {
          AWS_BEDROCK_REGION: "aws-region",
          AWS_BEDROCK_PROFILE: "default",
        },
        { messages, modelId },
        callbacks
      );

      expect(callbacks.onStart).toHaveBeenCalledTimes(1);
      expect(callbacks.onToken).not.toHaveBeenCalled();
      expect(callbacks.onComplete).not.toHaveBeenCalled();
      expect(callbacks.onError).toHaveBeenCalledWith(mockError);
    });
  });
});
