import {
  InvokeModelParamsResponse,
  ModelMessageFormat,
  ModelResponse,
  BedrockModelServiceProvider,
  InvokeModelParamsRequest,
} from "@/types/ai.types";
import { MessageRole } from "@/entities/Message";

type AnthropicMessageRole = "user" | "assistant";

type AnthropicRequestMessagePart =
  | string
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: string;
        data: string;
      };
    };

export type AnthropicRequestMessage = {
  role: AnthropicMessageRole;
  content: AnthropicRequestMessagePart[] | string;
};

/**
 * See format info at https://docs.anthropic.com/en/api/messages
 */
export class AnthropicService implements BedrockModelServiceProvider {
  async getInvokeModelParams(request: InvokeModelParamsRequest): Promise<InvokeModelParamsResponse> {
    const { systemPrompt, messages, modelId, temperature, maxTokens } = request;

    // Convert messages to Anthropic format
    // https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html
    const anthropicMessages: AnthropicRequestMessage[] = messages.map(msg => {
      if (typeof msg.body === "string") {
        return {
          role: msg.role === MessageRole.ASSISTANT ? "assistant" : "user",
          content: msg.body,
        };
      }

      const content: AnthropicRequestMessagePart[] = msg.body.map(m => {
        if (m.contentType === "image") {
          // input format "data:image/jpeg;base64,{base64_image}"
          const parts = m.content.match(/^data:image\/([^;]+);base64,(.*)$/);
          if (!parts || parts.length !== 3) {
            throw new Error("Invalid image format, expected base64 data URL starting with 'data:image/xxxl;base64,'");
          }

          // parts[0] is the full match, parts[1] is the media type, parts[2] is the base64 data
          const base64Data = parts[2]; // e.g., "iVBORw0KGgoAAAANSUhEUgAA..."
          const mediaType = parts[1]; // e.g., "jpeg", "png"

          const image: AnthropicRequestMessagePart = {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/" + mediaType,
              data: base64Data,
            },
          };
          return image;
        } else {
          return {
            type: "text",
            text: m.content,
          };
        }
      });

      return {
        role: msg.role === MessageRole.ASSISTANT ? "assistant" : "user",
        content,
      };
    });

    const params = {
      modelId,
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: maxTokens,
        messages: anthropicMessages,
        system: systemPrompt,
        temperature,
      }),
    };

    // This part will be moved to the base service
    return { params };
  }

  parseResponse(responseBody: any, request: InvokeModelParamsRequest): ModelResponse {
    return {
      type: "text",
      content: responseBody.content[0].text || "",
    };
  }
}
