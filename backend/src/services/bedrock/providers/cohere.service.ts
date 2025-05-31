import {
  ModelMessage,
  ModelResponse,
  BedrockModelServiceProvider,
  StreamCallbacks,
  InvokeModelParamsRequest,
  InvokeModelParamsResponse,
} from "@/types/ai.types";
import { MessageRole } from "@/entities/Message";

export class CohereService implements BedrockModelServiceProvider {
  async getInvokeModelParams(request: InvokeModelParamsRequest): Promise<InvokeModelParamsResponse> {
    const { systemPrompt, messages, modelId, temperature, maxTokens, topP } = request;
    // Convert messages to Cohere format
    let prompt = systemPrompt ? `System: ${systemPrompt}\n` : "";

    for (const msg of messages) {
      const content =
        typeof msg.body === "string"
          ? msg.body
          : msg.body
              .filter(m => m.contentType === "text")
              .map(m => m.content)
              .join(" ");

      if (msg.role === MessageRole.USER) {
        prompt += `User: ${content}\n`;
      } else if (msg.role === MessageRole.ASSISTANT) {
        prompt += `Chatbot: ${content}\n`;
      } else if (msg.role === MessageRole.SYSTEM) {
        // Add as preamble
        prompt = `${content}\n\n` + prompt;
      }
    }

    // Add the final chatbot prompt
    prompt += "Chatbot:";

    // https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-cohere-command.html
    const params = {
      modelId,
      body: JSON.stringify({
        prompt: prompt.substring(0, 2048), // Cohere has a max input length
        max_tokens: maxTokens,
        p: topP,
        temperature,
        stop_sequences: ["User:"],
      }),
    };

    return { params };
  }

  parseResponse(responseBody: any, request: InvokeModelParamsRequest): ModelResponse {
    return {
      type: "text",
      content: responseBody.generations?.[0]?.text || "",
    };
  }
}
