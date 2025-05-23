import { ModelMessageFormat, ModelResponse, ModelServiceProvider, StreamCallbacks } from "../../types/ai.types";
import { MessageRole } from "../../entities/Message";
import { logger } from "../../utils/logger";

export class AmazonService implements ModelServiceProvider {
  async generateResponseParams(
    messages: ModelMessageFormat[],
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

    logger.debug({ modelId, params }, "Call Amazon model");

    return { params };
  }

  parseResponse(responseBody: any): ModelResponse {
    return {
      type: "text",
      content: responseBody.results?.[0]?.outputText || "",
    };
  }
}
