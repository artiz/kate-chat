import { MessageFormat, ModelServiceProvider, StreamCallbacks } from "../../types/ai.types";
import { MessageRole } from "../../entities/Message";

export class MistralService implements ModelServiceProvider {
  async generateResponse(
    messages: MessageFormat[],
    modelId: string,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<any> {
    // Convert messages to Mistral format
    const mistralMessages = [];

    for (const msg of messages) {
      if (msg.role === MessageRole.USER) {
        mistralMessages.push({
          role: "user",
          content: msg.content,
        });
      } else if (msg.role === MessageRole.ASSISTANT) {
        mistralMessages.push({
          role: "assistant",
          content: msg.content,
        });
      } else if (msg.role === MessageRole.SYSTEM) {
        mistralMessages.push({
          role: "system",
          content: msg.content,
        });
      }
    }

    const params = {
      modelId,
      body: JSON.stringify({
        messages: mistralMessages,
        max_tokens: maxTokens,
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
    const { params } = await this.generateResponse(messages, modelId, temperature, maxTokens);
    return { params } as any;
  }

  parseResponse(responseBody: any): string {
    return responseBody.outputs[0]?.text || "";
  }
}
