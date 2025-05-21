import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { bedrockClient } from "../../config/bedrock";
import { MessageFormat, ModelProvider, StreamCallbacks } from "../../types/ai.types";
import { MessageRole } from "../../entities/Message";

export class AnthropicService implements ModelProvider {
  async generateResponse(
    messages: MessageFormat[],
    modelId: string,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<any> {
    // Convert messages to Anthropic format
    const anthropicMessages = messages.map(msg => ({
      role: msg.role === MessageRole.ASSISTANT ? "assistant" : "user",
      content: msg.content,
    }));

    const params = {
      modelId,
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: maxTokens,
        messages: anthropicMessages,
        temperature,
      }),
    };

    // This part will be moved to the base service
    return { params };
  }

  async streamResponse(
    messages: MessageFormat[],
    modelId: string,
    callbacks: StreamCallbacks,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<void> {
    // Convert messages to Anthropic format
    const anthropicMessages = messages.map(msg => ({
      role: msg.role === MessageRole.ASSISTANT ? "assistant" : "user",
      content: msg.content,
    }));

    const params = {
      modelId,
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: maxTokens,
        messages: anthropicMessages,
        temperature,
      }),
    };

    // Return params for the base service to handle
    return { params } as any;
  }

  parseResponse(responseBody: any): string {
    return responseBody.content[0].text || "";
  }
}
