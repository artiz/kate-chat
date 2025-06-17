import {
  ModelMessage,
  ModelResponse,
  BedrockModelServiceProvider,
  InvokeModelParamsRequest,
  InvokeModelParamsResponse,
} from "@/types/ai.types";
import { MessageRole } from "@/types/ai.types";
import { ok } from "assert";
import { createLogger } from "@/utils/logger";

const logger = createLogger(__filename);

type ModelResponseOutput = {
  text: string;
  stopReason?: string;
};

type MistralResponse = {
  outputs: ModelResponseOutput[];
};

export class MistralService implements BedrockModelServiceProvider<MistralResponse> {
  async getInvokeModelParams(request: InvokeModelParamsRequest): Promise<InvokeModelParamsResponse> {
    const { systemPrompt, messages = [], modelId, temperature, maxTokens, topP } = request;
    ok(messages.length);

    // Convert messages to Mistral format
    // https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-mistral-text-completion.html
    const lastUserMessage = messages[messages.length - 1];
    const hasHistory = messages.length > 2;
    const mistralMessages: string[] = [];
    let historyStarted = false;

    for (const msg of messages.slice(0, -1)) {
      const content = parseMessageContent(msg);

      if (msg.role === MessageRole.USER) {
        mistralMessages.push(
          `${hasHistory && !historyStarted ? `<s>${systemPrompt ? systemPrompt + "\n" : ""}` : ""}[INST]${content}[/INST]`
        );
        if (hasHistory) historyStarted = true;
      } else if (msg.role === MessageRole.ASSISTANT) {
        mistralMessages.push(content);
      }
    }

    if (hasHistory) {
      mistralMessages[mistralMessages.length - 1] += "</s>";
    }

    mistralMessages.push(`[INST]${parseMessageContent(lastUserMessage)}[/INST]`);
    logger.debug({ modelId }, "Call Mistral model");

    return {
      modelId,
      body: JSON.stringify({
        prompt: mistralMessages.join("\n"),
        max_tokens: maxTokens,
        top_p: topP,
        temperature,
      }),
    };
  }

  parseResponse(responseBody: MistralResponse, request: InvokeModelParamsRequest): ModelResponse {
    return {
      type: "text",
      content: responseBody.outputs[0]?.text || "",
    };
  }
}

function parseMessageContent(msg: ModelMessage) {
  return typeof msg.body === "string"
    ? msg.body
    : msg.body
        .filter(m => m.contentType === "text")
        .map(m => m.content)
        .join("\n");
}
