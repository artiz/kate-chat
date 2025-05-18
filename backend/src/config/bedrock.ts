import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { BedrockClient } from "@aws-sdk/client-bedrock";

// AWS Bedrock client configuration
export const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-west-2",
  // The credentials will be picked up from environment variables or AWS profile
});

// AWS Bedrock management client for non-runtime operations (listing models, etc.)
export const bedrockManagementClient = new BedrockClient({
  region: process.env.AWS_REGION || "us-west-2",
  // The credentials will be picked up from environment variables or AWS profile
});

// Model IDs for different providers on AWS Bedrock
export const BEDROCK_MODEL_IDS = {
  // Anthropic models
  "anthropic.claude-3-sonnet-20240229-v1:0": {
    provider: "Anthropic",
    name: "Claude 3 Sonnet",
    contextWindow: 200000,
    maxTokens: 2048,
  },
  "anthropic.claude-3-opus-20240229-v1:0": {
    provider: "Anthropic",
    name: "Claude 3 Opus",
    contextWindow: 200000,
    maxTokens: 2048,
  },
  "anthropic.claude-3-haiku-20240307-v1:0": {
    provider: "Anthropic",
    name: "Claude 3 Haiku",
    contextWindow: 200000,
    maxTokens: 2048,
  },
  "anthropic.claude-v2:1": {
    provider: "Anthropic",
    name: "Claude 2",
    contextWindow: 100000,
    maxTokens: 2048,
  },
  "anthropic.claude-instant-v1": {
    provider: "Anthropic",
    name: "Claude Instant",
    contextWindow: 100000,
    maxTokens: 2048,
  },

  // Amazon models
  "amazon.titan-text-express-v1": {
    provider: "Amazon",
    name: "Titan Text Express",
    contextWindow: 8000,
    maxTokens: 2048,
  },
  "amazon.titan-text-lite-v1": {
    provider: "Amazon",
    name: "Titan Text Lite",
    contextWindow: 4000,
    maxTokens: 2048,
  },

  // AI21 models
  "ai21.j2-mid-v1": {
    provider: "AI21",
    name: "Jurassic-2 Mid",
    contextWindow: 8000,
    maxTokens: 2048,
  },
  "ai21.j2-ultra-v1": {
    provider: "AI21",
    name: "Jurassic-2 Ultra",
    contextWindow: 8000,
    maxTokens: 2048,
  },

  // Cohere models
  "cohere.command-text-v14": {
    provider: "Cohere",
    name: "Command Text",
    contextWindow: 4096,
    maxTokens: 2048,
  },
  "cohere.command-light-text-v14": {
    provider: "Cohere",
    name: "Command Light Text",
    contextWindow: 4096,
    maxTokens: 2048,
  },

  // Meta models
  "meta.llama2-13b-chat-v1": {
    provider: "Meta",
    name: "Llama 2 13B Chat",
    contextWindow: 4096,
    maxTokens: 2048,
  },
  "meta.llama2-70b-chat-v1": {
    provider: "Meta",
    name: "Llama 2 70B Chat",
    contextWindow: 4096,
    maxTokens: 2048,
  },
  "meta.llama3-8b-instruct-v1:0": {
    provider: "Meta",
    name: "Llama 3 8B Instruct",
    contextWindow: 8192,
    maxTokens: 2048,
  },
  "meta.llama3-70b-instruct-v1:0": {
    provider: "Meta",
    name: "Llama 3 70B Instruct",
    contextWindow: 8192,
    maxTokens: 2048,
  },

  // Mistral models
  "mistral.mistral-7b-instruct-v0:2": {
    provider: "Mistral",
    name: "Mistral 7B Instruct",
    contextWindow: 8192,
    maxTokens: 2048,
  },
  "mistral.mixtral-8x7b-instruct-v0:1": {
    provider: "Mistral",
    name: "Mixtral 8x7B Instruct",
    contextWindow: 32768,
    maxTokens: 2048,
  },
};
