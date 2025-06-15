import {
  ModelResponse,
  BedrockModelServiceProvider,
  InvokeModelParamsRequest,
  InvokeModelParamsResponse,
} from "@/types/ai.types";
import { MessageRole } from "@/entities/Message";

type MetaResponse = {
  generation?: string;
  prompt_token_count?: number;
  generation_token_count?: number;
  stop_reason?: string;
};
export class MetaService implements BedrockModelServiceProvider<MetaResponse> {
  async getInvokeModelParams(request: InvokeModelParamsRequest): Promise<InvokeModelParamsResponse> {
    const { systemPrompt, messages = [], modelId, temperature, maxTokens, topP } = request;
    // Convert messages to Llama chat format

    let prompt =
      "<|begin_of_text|>" +
      (systemPrompt ? `<|start_header_id|>system<|end_header_id|>\n\n${systemPrompt}<|eot_id|>` : "");

    for (const msg of messages) {
      const content =
        typeof msg.body === "string"
          ? msg.body
          : msg.body
              .filter(m => m.contentType === "text")
              .map(m => m.content)
              .join(" ");

      if (msg.role === MessageRole.USER) {
        prompt += `<|start_header_id|>user<|end_header_id|>\n\n${content}<|eot_id|>`;
      } else if (msg.role === MessageRole.ASSISTANT) {
        prompt += `<|start_header_id|>assistant<|end_header_id|>\n\n${content}<|eot_id|>`;
      } else if (msg.role === MessageRole.SYSTEM) {
        // Prepend system message
        prompt = `<|start_header_id|>system<|end_header_id|>\n\n${content}<|eot_id|>` + prompt;
      }
    }

    // https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-meta.html
    const params = {
      modelId,
      body: JSON.stringify({
        prompt,
        max_gen_len: maxTokens,
        temperature,
        top_p: topP,
      }),
    };

    return { params };
  }

  parseResponse(responseBody: MetaResponse, request: InvokeModelParamsRequest): ModelResponse {
    return {
      type: "text",
      content: responseBody.generation || "",
    };
  }
}
