import { AIService } from "../ai.service";
import { bedrockManagementClient, bedrockClient } from "../../config/bedrock";
import { ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";
import { InvokeModelCommand, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { MessageRole } from "../../entities/Message";
import { MessageFormat } from "../../types/ai.types";

// Mock the AWS SDK
jest.mock("@aws-sdk/client-bedrock", () => {
  return {
    ListFoundationModelsCommand: jest.fn(),
    BedrockClient: jest.fn(),
  };
});

jest.mock("@aws-sdk/client-bedrock-runtime", () => {
  return {
    InvokeModelCommand: jest.fn(),
    InvokeModelWithResponseStreamCommand: jest.fn(),
    BedrockRuntimeClient: jest.fn(),
  };
});

jest.mock("../../config/bedrock", () => {
  return {
    bedrockManagementClient: {
      send: jest.fn(),
    },
    bedrockClient: {
      send: jest.fn(),
    },
  };
});

describe("AIService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("generateResponse", () => {
    it("should generate a response using Anthropic provider", async () => {
      const aiService = new AIService();
      const messages: MessageFormat[] = [
        { role: MessageRole.SYSTEM, content: "You are a helpful AI assistant." },
        { role: MessageRole.USER, content: "Hello, how are you?" },
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

      (bedrockClient.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      const response = await aiService.generateResponse(messages, modelId);

      expect(response).toBe("I'm doing well, thanks for asking!");
      expect(InvokeModelCommand).toHaveBeenCalledTimes(1);
      expect(bedrockClient.send).toHaveBeenCalledTimes(1);
    });

    it("should generate a response using Meta provider", async () => {
      const aiService = new AIService();
      const messages: MessageFormat[] = [
        { role: MessageRole.SYSTEM, content: "You are a helpful AI assistant." },
        { role: MessageRole.USER, content: "Hello, how are you?" },
      ];
      const modelId = "meta.llama2-13b-chat-v1";

      // Mock the AWS Bedrock response
      const mockResponse = {
        body: Buffer.from(
          JSON.stringify({
            generation: "I'm a language model, I don't have feelings, but I'm here to help!",
          })
        ),
      };

      (bedrockClient.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      const response = await aiService.generateResponse(messages, modelId);

      expect(response).toBe("I'm a language model, I don't have feelings, but I'm here to help!");
      expect(InvokeModelCommand).toHaveBeenCalledTimes(1);
      expect(bedrockClient.send).toHaveBeenCalledTimes(1);
    });

    it("should throw an error for unsupported model provider", async () => {
      const aiService = new AIService();
      const messages: MessageFormat[] = [{ role: MessageRole.USER, content: "Hello" }];
      const modelId = "unknown.model-v1";

      await expect(aiService.generateResponse(messages, modelId)).rejects.toThrow("Unsupported model provider");
    });
  });

  describe("streamResponse", () => {
    it("should stream a response using Anthropic provider", async () => {
      const aiService = new AIService();
      const messages: MessageFormat[] = [{ role: MessageRole.USER, content: "Hello" }];
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

      (bedrockClient.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      await aiService.streamResponse(messages, modelId, callbacks);

      expect(callbacks.onStart).toHaveBeenCalledTimes(1);
      expect(callbacks.onToken).toHaveBeenCalledTimes(2);
      expect(callbacks.onToken).toHaveBeenNthCalledWith(1, "Hello");
      expect(callbacks.onToken).toHaveBeenNthCalledWith(2, ", world!");
      expect(callbacks.onComplete).toHaveBeenCalledWith("Hello, world!");
      expect(callbacks.onError).not.toHaveBeenCalled();
    });

    it("should simulate streaming for non-streaming models", async () => {
      // Mock the AIService.generateResponse method directly to avoid timeout issues
      const aiService = new AIService();
      const messages: MessageFormat[] = [{ role: MessageRole.USER, content: "Hello" }];
      const modelId = "ai21.j2-ultra-v1"; // Non-streaming model

      const callbacks = {
        onStart: jest.fn(),
        onToken: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      // Mock the generateResponse to return immediately
      jest.spyOn(aiService, "generateResponse").mockResolvedValueOnce("Hello there!");

      // Mock the setTimeout to execute immediately
      jest.spyOn(global, "setTimeout").mockImplementation(callback => {
        callback();
        return {} as any;
      });

      await aiService.streamResponse(messages, modelId, callbacks);

      expect(callbacks.onStart).toHaveBeenCalledTimes(1);
      expect(callbacks.onToken).toHaveBeenCalled();
      expect(callbacks.onComplete).toHaveBeenCalledWith("Hello there!");
      expect(callbacks.onError).not.toHaveBeenCalled();

      // Clean up mocks
      jest.restoreAllMocks();
    });

    it("should handle errors during streaming", async () => {
      const aiService = new AIService();
      const messages: MessageFormat[] = [{ role: MessageRole.USER, content: "Hello" }];
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

      await aiService.streamResponse(messages, modelId, callbacks);

      expect(callbacks.onStart).toHaveBeenCalledTimes(1);
      expect(callbacks.onToken).not.toHaveBeenCalled();
      expect(callbacks.onComplete).not.toHaveBeenCalled();
      expect(callbacks.onError).toHaveBeenCalledWith(mockError);
    });
  });
});
