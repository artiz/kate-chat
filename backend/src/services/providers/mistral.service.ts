import { ModelMessageFormat, ModelResponse, ModelServiceProvider, StreamCallbacks } from "../../types/ai.types";
import { MessageRole } from "../../entities/Message";
import { ok } from "assert";
import { createLogger } from "../../utils/logger";

const logger = createLogger(__filename);

export class MistralService implements ModelServiceProvider {
  async generateResponseParams(
    messages: ModelMessageFormat[],
    modelId: string,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<any> {
    ok(messages.length);

    // Convert messages to Mistral format
    const lastUserMessage = messages[messages.length - 1];
    const hasHistory = messages.length > 2;
    const mistralMessages: string[] = [];
    let historyStarted = false;

    for (const msg of messages.slice(0, -1)) {
      if (msg.role === MessageRole.USER) {
        mistralMessages.push(`${hasHistory && !historyStarted ? "<s>" : ""}[INST]${msg.content}[/INST]`);
        if (hasHistory) historyStarted = true;
      } else if (msg.role === MessageRole.ASSISTANT) {
        mistralMessages.push(msg.content);
      }
    }
    if (hasHistory) {
      mistralMessages[mistralMessages.length - 1] += "</s>";
    }
    mistralMessages.push(`[INST]${lastUserMessage.content}[/INST]`);

    const params = {
      modelId,
      body: JSON.stringify({
        prompt: mistralMessages.join("\n"),
        max_tokens: maxTokens,
        temperature,
      }),
    };

    logger.debug({ modelId, messages: mistralMessages }, "Call Mistral model");

    return { params };
  }

  parseResponse(responseBody: any): ModelResponse {
    return {
      type: "text",
      content: responseBody.outputs[0]?.text || "",
    };
  }
}
