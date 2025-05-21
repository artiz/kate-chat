import { MessageFormat, ModelServiceProvider, StreamCallbacks } from "../../types/ai.types";
import { MessageRole } from "../../entities/Message";

export class CohereService implements ModelServiceProvider {
  async generateResponseParams(
    messages: MessageFormat[],
    modelId: string,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<any> {
    // Convert messages to Cohere format
    let prompt = "";
    for (const msg of messages) {
      if (msg.role === MessageRole.USER) {
        prompt += `User: ${msg.content}\n`;
      } else if (msg.role === MessageRole.ASSISTANT) {
        prompt += `Chatbot: ${msg.content}\n`;
      } else if (msg.role === MessageRole.SYSTEM) {
        // Add as preamble
        prompt = `${msg.content}\n\n` + prompt;
      }
    }

    // Add the final chatbot prompt
    prompt += "Chatbot:";

    const params = {
      modelId,
      body: JSON.stringify({
        prompt,
        max_tokens: maxTokens,
        temperature,
        stop_sequences: ["User:"],
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
    return responseBody.generations?.[0]?.text || "";
  }
}
