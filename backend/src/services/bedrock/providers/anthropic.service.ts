import {
  InvokeModelParamsResponse,
  ModelMessageFormat,
  ModelResponse,
  BedrockModelServiceProvider,
  InvokeModelParamsRequest,
} from "@/types/ai.types";
import { MessageRole } from "@/entities/Message";

/**
 * See format info at https://docs.anthropic.com/en/api/messages
 */
export class AnthropicService implements BedrockModelServiceProvider {
  async getInvokeModelParams(request: InvokeModelParamsRequest): Promise<InvokeModelParamsResponse> {
    const { systemPrompt, messages, modelId, temperature, maxTokens } = request;
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
        system: systemPrompt,
        temperature,
      }),
    };

    // This part will be moved to the base service
    return { params };
  }

  parseResponse(responseBody: any): ModelResponse {
    return {
      type: "text",
      content: responseBody.content[0].text || "",
    };
  }
}
