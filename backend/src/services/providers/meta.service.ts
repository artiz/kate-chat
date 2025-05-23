import { MessageFormat, ModelResponse, ModelServiceProvider, StreamCallbacks } from "../../types/ai.types";
import { MessageRole } from "../../entities/Message";
import { DEFAULT_PROMPT } from "../../config/ai";

export class MetaService implements ModelServiceProvider {
  async generateResponseParams(
    messages: MessageFormat[],
    modelId: string,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<any> {
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
        prompt: DEFAULT_PROMPT,
        messages: llamaMessages,
        max_gen_len: maxTokens,
        temperature,
      }),
    };

    return { params };
  }

  async streamResponse(
    messages: MessageFormat[],
    modelId: string,
    callbacks: StreamCallbacks,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<void> {
    // Use the same parameters as non-streaming for now
    const { params } = await this.generateResponseParams(messages, modelId, temperature, maxTokens);
    return { params } as any;
  }

  parseResponse(responseBody: any): ModelResponse {
    return {
      type: "text",
      content: responseBody.generation || "",
    };
  }
}
