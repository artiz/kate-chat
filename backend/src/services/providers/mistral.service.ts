import { MessageFormat, ModelResponse, ModelServiceProvider, StreamCallbacks } from "../../types/ai.types";
import { MessageRole } from "../../entities/Message";
import { ok } from "assert";

export class MistralService implements ModelServiceProvider {
  async generateResponseParams(
    messages: MessageFormat[],
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

    console.debug("Call Mistral model", modelId, mistralMessages);

    return { params };
  }

  async streamResponse(
    messages: MessageFormat[],
    modelId: string,
    callbacks: StreamCallbacks,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<void> {
    // Use the same parameters as non-streaming for now
    const { params } = await this.generateResponseParams(messages, modelId, temperature, maxTokens);
    return { params } as any;
  }

  parseResponse(responseBody: any): ModelResponse {
    return {
      type: "text",
      content: responseBody.outputs[0]?.text || "",
    };
  }
}
