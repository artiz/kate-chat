import {
  ModelResponse,
  BedrockModelServiceProvider,
  InvokeModelParamsRequest,
  InvokeModelParamsResponse,
} from "@/types/ai.types";
import { MessageRole } from "@/types/ai.types";
import { createLogger } from "@/utils/logger";

const logger = createLogger(__filename);

type A21ModelResponseChoice = {
  index?: number;
  message: {
    role: string;
    content: string;
    tool_calls?: unknown[];
  };
  finish_reason?: string;
};

export type A21InvokeModelResponse = {
  choices: A21ModelResponseChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export class AI21Service implements BedrockModelServiceProvider<A21InvokeModelResponse> {
  async getInvokeModelParams(request: InvokeModelParamsRequest): Promise<InvokeModelParamsResponse> {
    const { systemPrompt, messages = [], modelId, temperature, maxTokens, topP } = request;
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

    return params;
  }

  parseResponse(responseBody: A21InvokeModelResponse, request: InvokeModelParamsRequest): ModelResponse {
    return {
      type: "text",
      content: responseBody.choices?.[0]?.message?.content || "",
      usage: {
        inputTokens: responseBody.usage?.prompt_tokens || 0,
        outputTokens: responseBody.usage?.completion_tokens || 0,
      },
    };
  }
}
