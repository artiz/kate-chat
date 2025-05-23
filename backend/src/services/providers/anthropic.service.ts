import {
  GenerateResponseParams,
  MessageFormat,
  ModelResponse,
  ModelServiceProvider,
  StreamCallbacks,
} from "../../types/ai.types";
import { MessageRole } from "../../entities/Message";
import { DEFAULT_PROMPT } from "../../config/ai";

/**
 * See format info at https://docs.anthropic.com/en/api/messages
 */
export class AnthropicService implements ModelServiceProvider {
  async generateResponseParams(
    messages: MessageFormat[],
    modelId: string,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<GenerateResponseParams> {
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
        system: DEFAULT_PROMPT,
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

  parseResponse(responseBody: any): ModelResponse {
    return {
      type: "text",
      content: responseBody.content[0].text || "",
    };
  }
}
