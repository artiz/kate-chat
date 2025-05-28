import {
  ModelMessageFormat,
  ModelResponse,
  BedrockModelServiceProvider,
  StreamCallbacks,
  InvokeModelParamsRequest,
  InvokeModelParamsResponse,
} from "@/types/ai.types";
import { MessageRole } from "@/entities/Message";

export class MetaService implements BedrockModelServiceProvider {
  async getInvokeModelParams(request: InvokeModelParamsRequest): Promise<InvokeModelParamsResponse> {
    const { systemPrompt, messages, modelId, temperature, maxTokens } = request;
    // Convert messages to Llama chat format
    const llamaMessages = [];

    for (const msg of messages) {
      if (msg.role === MessageRole.USER) {
        llamaMessages.push({
          role: "user",
          content: msg.content,
        });
      } else if (msg.role === MessageRole.ASSISTANT) {
        llamaMessages.push({
          role: "assistant",
          content: msg.content,
        });
      } else if (msg.role === MessageRole.SYSTEM) {
        llamaMessages.push({
          role: "system",
          content: msg.content,
        });
      }
    }

    const params = {
      modelId,
      body: JSON.stringify({
        prompt: systemPrompt,
        messages: llamaMessages,
        max_gen_len: maxTokens,
        temperature,
      }),
    };

    return { params };
  }

  parseResponse(responseBody: any): ModelResponse {
    return {
      type: "text",
      content: responseBody.generation || "",
    };
  }
}
