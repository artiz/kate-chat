import { MessageFormat, ModelServiceProvider, StreamCallbacks } from "../../types/ai.types";
import { MessageRole } from "../../entities/Message";

export class AmazonService implements ModelServiceProvider {
  async generateResponseParams(
    messages: MessageFormat[],
    modelId: string,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<any> {
    // Convert messages to a single prompt for Amazon models
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
        inputText: prompt,
        textGenerationConfig: {
          maxTokenCount: maxTokens,
          temperature,
          stopSequences: ["Human:"],
        },
      }),
    };

    console.log("AmazonService generateResponseParams", params);

    return { params };
  }

  async streamResponse(
    messages: MessageFormat[],
    modelId: string,
    callbacks: StreamCallbacks,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<void> {
    // Use the same parameters as the non-streaming version
    const { params } = await this.generateResponseParams(messages, modelId, temperature, maxTokens);
    return { params } as any;
  }

  parseResponse(responseBody: any): string {
    return responseBody.results?.[0]?.outputText || "";
  }
}
