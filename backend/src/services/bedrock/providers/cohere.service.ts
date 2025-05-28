import {
  ModelMessageFormat,
  ModelResponse,
  BedrockModelServiceProvider,
  StreamCallbacks,
  InvokeModelParamsRequest,
  InvokeModelParamsResponse,
} from "@/types/ai.types";
import { MessageRole } from "@/entities/Message";

export class CohereService implements BedrockModelServiceProvider {
  async getInvokeModelParams(request: InvokeModelParamsRequest): Promise<InvokeModelParamsResponse> {
    const { systemPrompt, messages, modelId, temperature, maxTokens } = request;
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

  parseResponse(responseBody: any): ModelResponse {
    return {
      type: "text",
      content: responseBody.generations?.[0]?.text || "",
    };
  }
}
