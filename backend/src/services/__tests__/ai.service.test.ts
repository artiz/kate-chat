import { AIService } from "../ai.service";
import { bedrockManagementClient } from "../../config/bedrock";
import { ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";

// Mock the AWS SDK
jest.mock("@aws-sdk/client-bedrock", () => {
  return {
    ListFoundationModelsCommand: jest.fn(),
    BedrockClient: jest.fn()
  };
});

jest.mock("../../config/bedrock", () => {
  return {
    bedrockManagementClient: {
      send: jest.fn()
    },
    bedrockClient: {
      send: jest.fn()
    },
    BEDROCK_MODEL_IDS: {
      "anthropic.claude-3-sonnet-20240229-v1:0": {
        provider: "Anthropic",
        name: "Claude 3 Sonnet",
        contextWindow: 200000
      },
      "meta.llama2-13b-chat-v1": {
        provider: "Meta",
        name: "Llama 2 13B Chat",
        contextWindow: 4096
      }
    }
  };
});

describe("AIService", () => {
  describe("getModelProviders", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    
    it("should fetch model providers from AWS Bedrock", async () => {
      // Mock the AWS Bedrock response
      const mockResponse = {
        modelSummaries: [
          {
            modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
            providerName: "Anthropic"
          },
          {
            modelId: "meta.llama2-13b-chat-v1",
            providerName: "Meta"
          },
          {
            modelId: "anthropic.claude-3-haiku-20240307-v1:0",
            providerName: "Anthropic"
          }
        ]
      };
      
      (bedrockManagementClient.send as jest.Mock).mockResolvedValueOnce(mockResponse);
      
      const providers = await AIService.getModelProviders();
      
      // Should return unique providers
      expect(providers.length).toBe(2);
      expect(providers[0].name).toBe("Anthropic");
      expect(providers[1].name).toBe("Meta");
      
      // Verify the API was called correctly
      expect(ListFoundationModelsCommand).toHaveBeenCalledTimes(1);
      expect(bedrockManagementClient.send).toHaveBeenCalledTimes(1);
    });
    
    it("should fall back to predefined providers if API call fails", async () => {
      // Mock a failed API call
      (bedrockManagementClient.send as jest.Mock).mockRejectedValueOnce(
        new Error("API call failed")
      );
      
      const providers = await AIService.getModelProviders();
      
      // Should fall back to predefined providers from BEDROCK_MODEL_IDS
      expect(providers.length).toBe(2);
      expect(providers[0].name).toBe("Anthropic");
      expect(providers[1].name).toBe("Meta");
      
      // Verify the API was called
      expect(ListFoundationModelsCommand).toHaveBeenCalledTimes(1);
      expect(bedrockManagementClient.send).toHaveBeenCalledTimes(1);
    });
    
    it("should fall back to predefined providers if API returns empty list", async () => {
      // Mock an empty response
      const mockResponse = {
        modelSummaries: []
      };
      
      (bedrockManagementClient.send as jest.Mock).mockResolvedValueOnce(mockResponse);
      
      const providers = await AIService.getModelProviders();
      
      // Should fall back to predefined providers
      expect(providers.length).toBe(2);
      expect(providers[0].name).toBe("Anthropic");
      expect(providers[1].name).toBe("Meta");
    });
  });
});