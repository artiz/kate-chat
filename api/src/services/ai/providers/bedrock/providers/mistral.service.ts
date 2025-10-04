import { ModelMessage, ModelResponse, CompleteChatRequest } from "@/types/ai.types";
import { MessageRole } from "@/types/ai.types";
import { ok } from "assert";
import { createLogger } from "@/utils/logger";
import { BedrockModelServiceProvider, InvokeModelParams } from "../../bedrock.provider";

const logger = createLogger(__filename);

type ModelResponseOutput = {
  text: string;
  stopReason?: string;
};

type ModelResponseChoice = {
  index: number;
  message: {
    role: string;
    tool_calls: any[] | null;
    tool_call_id: string | null;
    content: string | undefined;
    audio: string | undefined;
  };
  finish_reason: string;
};

type MistralResponse = {
  outputs?: ModelResponseOutput[];
  choices?: ModelResponseChoice[];
  prompt_tokens?: number;
  total_tokens?: number;
  completion_tokens?: number;
};

export class MistralService implements BedrockModelServiceProvider<MistralResponse> {
  async getInvokeModelParams(request: CompleteChatRequest): Promise<InvokeModelParams> {
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

  parseModelResponse(responseBody: MistralResponse, request: CompleteChatRequest): ModelResponse {
    const content = responseBody.outputs?.[0]?.text || responseBody.choices?.[0]?.message?.content || "";

    return {
      type: "text",
      content,
      metadata: {
        usage: {
          inputTokens: responseBody.prompt_tokens,
          outputTokens: responseBody.completion_tokens,
        },
      },
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
