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
