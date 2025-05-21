import { MessageFormat, ModelServiceProvider, StreamCallbacks } from "../../types/ai.types";
import { MessageRole } from "../../entities/Message";

export class AI21Service implements ModelServiceProvider {
  async generateResponseParams(
    messages: MessageFormat[],
    modelId: string,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<any> {
    // Convert messages to a single prompt
    let prompt = "";
    for (const msg of messages) {
      if (msg.role === MessageRole.USER) {
        prompt += `Human: ${msg.content}\n`;
      } else if (msg.role === MessageRole.ASSISTANT) {
        prompt += `Assistant: ${msg.content}\n`;
      } else if (msg.role === MessageRole.SYSTEM) {
        // Prepend system message
        prompt = `System: ${msg.content}\n` + prompt;
      }
    }

    // Add the final assistant prompt
    prompt += "Assistant:";

    const params = {
      modelId,
      body: JSON.stringify({
        prompt,
        maxTokens,
        temperature,
        stopSequences: ["Human:"],
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

  parseResponse(responseBody: any): string {
    return responseBody.completions?.[0]?.data?.text || "";
  }
}
