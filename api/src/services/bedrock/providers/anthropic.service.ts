import {
  InvokeModelParamsResponse,
  ModelMessage,
  ModelResponse,
  BedrockModelServiceProvider,
  InvokeModelParamsRequest,
  ModelMessageContent,
} from "@/types/ai.types";
import { MessageRole } from "@/types/ai.types";
import { notEmpty } from "@/utils/assert";
import { logger } from "@/utils/logger";

type AnthropicMessageRole = "user" | "assistant";
type AnthropicResponseType = "tool_use" | "text" | "image";

type AnthropicResponese = {
  id: string;
  model: string;
  role: AnthropicMessageRole;
  content: [
    {
      type: AnthropicResponseType;
      text?: string;
      image?: unknown;
      id?: string;
      name?: string;
      input?: string;
    },
  ];
  stop_reason?: string;
  stop_sequence?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

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
export class AnthropicService implements BedrockModelServiceProvider<AnthropicResponese> {
  async getInvokeModelParams(request: InvokeModelParamsRequest): Promise<InvokeModelParamsResponse> {
    const { systemPrompt, messages = [], modelId, temperature, maxTokens } = request;

    // Convert messages to Anthropic format
    // https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html
    const anthropicMessages: AnthropicRequestMessage[] = messages
      .flatMap(msg => {
        if (typeof msg.body === "string") {
          return [
            {
              role: msg.role === MessageRole.ASSISTANT ? "assistant" : "user",
              content: msg.body,
            } as AnthropicRequestMessage,
          ];
        }

        const images: AnthropicRequestMessagePart[] = msg.body
          .filter(m => m.contentType === "image")
          .map(m => {
            let base64Data = m.content;
            let mediaType = m.mimeType || "image/jpeg";
            // input format "data:image/jpeg;base64,{base64_image}"
            const parts = m.content.match(/^data:(image\/[^;]+);base64,(.*)$/);
            if (!parts && !mediaType) {
              logger.error({ content: m.content.substring(0, 256) }, "Invalid image format");
              throw new Error(
                "Invalid image format, expected base64 data URL starting with 'data:image/xxxl;base64,...',"
              );
            } else if (parts) {
              base64Data = parts[2]; // e.g., "iVBORw0KGgoAAAANSUhEUgAA..."
              mediaType = parts[1]; // e.g., "jpeg", "png"
            }
            const image: AnthropicRequestMessagePart = {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Data,
              },
            };
            return image;
          });

        const texts: AnthropicRequestMessagePart[] = msg.body
          .filter(m => m.contentType === "text")
          .map(m => {
            return {
              type: "text",
              text: m.content,
            };
          });

        if (msg.role === MessageRole.USER) {
          const userMessage: AnthropicRequestMessage = {
            role: "user",
            content: [...images, ...texts],
          };
          return [userMessage];
        }

        const result: AnthropicRequestMessage[] = [];
        if (images.length) {
          result.push({
            role: "user",
            content: [...images],
          });
        }

        if (texts.length) {
          result.push({
            role: "assistant",
            content: texts,
          });
        }
        return result;
      })
      .filter(notEmpty);

    logger.debug(
      {
        modelId,
        messages: anthropicMessages.map(m => ({
          role: m.role,
          content:
            typeof m.content === "string"
              ? m.content.substring(0, 15)
              : m.content.map(c => (typeof c === "string" ? c.substring(0, 15) : { ...c, source: undefined })),
        })),
      },
      "Call Anthropic model"
    );

    return {
      modelId,
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: maxTokens,
        messages: anthropicMessages,
        system: systemPrompt,
        temperature,
      }),
    };
  }

  parseResponse(responseBody: AnthropicResponese, request: InvokeModelParamsRequest): ModelResponse {
    return {
      type: "text",
      content: responseBody.content[0].text || "",
      metadata: {
        usage: {
          inputTokens: responseBody.usage?.input_tokens,
          outputTokens: responseBody.usage?.output_tokens,
        },
      },
    };
  }
}
