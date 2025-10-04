import { ModelMessage, ModelResponse, StreamCallbacks, CompleteChatRequest } from "@/types/ai.types";
import { MessageRole } from "@/types/ai.types";
import { logger } from "@/utils/logger";
import { notEmpty, ok } from "@/utils/assert";
import { BedrockModelServiceProvider, InvokeModelParams } from "../../bedrock.provider";

type AmazonMessageRole = "user" | "assistant";
type AmazonImageFormat = "jpeg" | "png" | "gif" | "webp";
type AmazonVideoFormat = "mkv" | "mov" | "mp4" | "webm" | "three_gp" | "flv" | "mpeg" | "mpg" | "wmv";

type TextPart = {
  text: string;
};
type AmazonNovaResponse = {
  output: {
    message: {
      content: TextPart[];
      role: AmazonMessageRole;
    };
  };
  stopReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadInputTokenCount: number;
    cacheWriteInputTokenCount: number;
  };
};

type TitanTextPart = {
  outputText: string;
};
type AmazonTitanResponse = {
  results: TitanTextPart[];
  stopReason?: string;
};

// https://docs.aws.amazon.com/nova/latest/userguide/complete-request-schema.html
type AmazonRequestMessagePart =
  | { text: string }
  | {
      image: {
        format: AmazonImageFormat;
        source: {
          bytes: string; // Binary array (Converse API) or Base64-encoded string (Invoke API)
        };
      };
    }
  | {
      video: {
        format: AmazonVideoFormat;
        source: {
          // Option 1: Sending a S3 location
          s3Location?: {
            uri: string; // example: s3://my-bucket/object-key
            bucketOwner: string; // (Optional) example: "123456789012"
          };
          // Option 2: Sending file bytes
          bytes?: string; // Binary array (Converse API) or Base64-encoded string (Invoke API)
        };
      };
    };

export type AmazonRequestMessage = {
  role: AmazonMessageRole;
  content: AmazonRequestMessagePart[];
};

export class AmazonService implements BedrockModelServiceProvider<AmazonNovaResponse | AmazonTitanResponse> {
  async getInvokeModelParams(request: CompleteChatRequest): Promise<InvokeModelParams> {
    const { systemPrompt, messages = [], modelId, temperature, maxTokens, topP } = request;

    // #region Titan models
    // Format request for Amazon Titan models
    // https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-titan-text.html
    if (modelId.startsWith("amazon.titan")) {
      let prompt = "";

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
        } else if (msg.role === MessageRole.ASSISTANT || msg.role === MessageRole.ERROR) {
          prompt += `Assistant: ${content}\n`;
        } else if (msg.role === MessageRole.SYSTEM) {
          // Prepend system message
          prompt = `System: ${content}\n` + prompt;
        }
      }

      // Add the final assistant prompt
      prompt += "Assistant:";

      const body = {
        inputText: prompt,
        textGenerationConfig: {
          maxTokenCount: maxTokens,
          temperature,
          topP,
          stopSequences: [],
        },
      };
      const params = {
        modelId,
        body: JSON.stringify(body),
      };

      logger.debug({ modelId, textGenerationConfig: body.textGenerationConfig }, "Call Amazon Titan model");

      return params;
    }
    // #endregion

    // Nova models
    // https://docs.aws.amazon.com/nova/latest/userguide/complete-request-schema.html

    const requestMessages: AmazonRequestMessage[] = messages.map(msg => {
      if (typeof msg.body === "string") {
        return {
          role: msg.role === MessageRole.ASSISTANT ? "assistant" : "user",
          content: [{ text: msg.body }],
        };
      }

      const content: AmazonRequestMessagePart[] = msg.body
        .map(m => {
          if (m.contentType === "image" || m.contentType === "video") {
            // input format "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABv..."
            let base64Data = m.content;
            let mediaType = m.mimeType?.split("/")[1];
            let format = m.mimeType?.split("/")[0]; // "image" or "video"

            const parts = m.content.match(/^data:(image|video)\/([^;]+);base64,(.*)/);
            if ((!parts || parts.length < 3) && !mediaType) {
              logger.error({ content: m.content.substring(0, 256) }, "Invalid image format");
              throw new Error(
                "Invalid image format, expected base64 data URL starting with 'data:image/xxxl;base64,...',"
              );
            } else if (parts) {
              // parts[0] is the full match, parts[1] is the media type, parts[2] is the base64 data
              base64Data = parts[3]; // e.g., "iVBORw0KGgoAAAANSUhEUgAA..."
              mediaType = parts[2]; // e.g., "jpeg", "png"
              format = parts[1]; // e.g., "image", "video"
            }

            if (format === "image") {
              const image: AmazonRequestMessagePart = {
                image: {
                  format: mediaType as AmazonImageFormat,
                  source: {
                    bytes: base64Data,
                  },
                },
              };
              return image;
            } else {
              const video: AmazonRequestMessagePart = {
                video: {
                  format: mediaType as AmazonVideoFormat,
                  source: {
                    bytes: base64Data, // Assuming we are sending bytes directly
                  },
                },
              };
              return video;
            }
          } else if (m.contentType === "text") {
            return {
              text: m.content,
            };
          } else {
            return undefined; // Ignore unsupported content types
          }
        })
        .filter(notEmpty); // Filter out any null values

      return {
        role: msg.role === MessageRole.ASSISTANT ? "assistant" : "user",
        content,
      };
    });

    const body: Record<string, any> = {
      messages: requestMessages,
      inferenceConfig: {
        maxTokens,
        temperature,
        topP,
        stopSequences: [],
      },
    };

    if (systemPrompt) {
      body.system = [{ text: systemPrompt }];
    }

    logger.debug({ modelId, inferenceConfig: body.inferenceConfig }, "Call Amazon model");

    return {
      modelId,
      body: JSON.stringify(body),
    };
  }

  parseModelResponse(
    responseBody: AmazonNovaResponse | AmazonTitanResponse,
    request: CompleteChatRequest
  ): ModelResponse {
    logger.debug({ responseBody }, "Amazon model response");

    if (request.modelId.startsWith("amazon.titan")) {
      // Amazon Titan response
      const response = responseBody as AmazonTitanResponse;
      ok(response.results, "Amazon Titan response should have results");
      const content = response.results[0]?.outputText || "";
      return {
        type: "text",
        content,
      };
    }

    // Amazon Nova response
    const response = responseBody as AmazonNovaResponse;
    const message = response.output.message;
    const content = message.content.map(part => part.text).join("");
    return {
      type: "text",
      content,
      metadata: {
        usage: {
          inputTokens: response.usage?.inputTokens,
          outputTokens: response.usage?.outputTokens,
        },
      },
    };
  }
}
