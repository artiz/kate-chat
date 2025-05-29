import {
  ModelResponse,
  BedrockModelServiceProvider,
  InvokeModelParamsRequest,
  InvokeModelParamsResponse,
} from "@/types/ai.types";
import { MessageRole } from "@/entities/Message";
import { createLogger } from "@/utils/logger";

const logger = createLogger(__filename);

export class AI21Service implements BedrockModelServiceProvider {
  async getInvokeModelParams(request: InvokeModelParamsRequest): Promise<InvokeModelParamsResponse> {
    const { systemPrompt, messages, modelId, temperature, maxTokens, topP } = request;
    let prompt = systemPrompt ? `System: ${systemPrompt}\n` : "";

    // Convert messages to AI21 format
    // https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-jurassic2.html
    for (const msg of messages) {
      const content =
        typeof msg.body === "string"
          ? msg.body
          : msg.body
              .filter(m => m.contentType === "text")
              .map(m => m.content)
              .join(" ");

      if (msg.role === MessageRole.USER) {
        prompt += `Human: ${content}\n`;
      } else if (msg.role === MessageRole.ASSISTANT) {
        prompt += `Assistant: ${content}\n`;
      } else if (msg.role === MessageRole.SYSTEM) {
        // Prepend system message
        prompt = `System: ${content}\n` + prompt;
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
        topP,
        stopSequences: ["Human:"],
      }),
    };

    logger.debug({ modelId, prompt }, "Call A21 model");

    return { params };
  }

  parseResponse(responseBody: any, request: InvokeModelParamsRequest): ModelResponse {
    return {
      type: "text",
      content: responseBody.completions?.[0]?.data?.text || "",
    };
  }
}
