import { ModelMessageFormat, ModelResponse, ModelServiceProvider, StreamCallbacks } from "../../types/ai.types";
import { MessageRole } from "../../entities/Message";
import { createLogger } from "../../utils/logger";

const logger = createLogger(__filename);

export class AI21Service implements ModelServiceProvider {
  async generateResponseParams(
    messages: ModelMessageFormat[],
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

    logger.debug({ modelId, prompt }, "Call A21 model");

    return { params };
  }

  parseResponse(responseBody: any): ModelResponse {
    return {
      type: "text",
      content: responseBody.completions?.[0]?.data?.text || "",
    };
  }
}
