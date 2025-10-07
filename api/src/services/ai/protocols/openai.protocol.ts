import OpenAI from "openai";
import {
  ModelMessage,
  ModelResponse,
  StreamCallbacks,
  CompleteChatRequest,
  MessageMetadata,
  GetEmbeddingsRequest,
  EmbeddingsResponse,
  ToolType,
  ResponseStatus,
  ModelMessageContent,
  ChatToolCallResult,
} from "@/types/ai.types";
import { MessageRole } from "@/types/ai.types";
import { createLogger } from "@/utils/logger";
import { notEmpty } from "@/utils/assert";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { ChatCompletionToolCall, COMPLETION_API_TOOLS, WEB_SEARCH_TOOL, WEB_SEARCH_TOOL_NAME } from "./openai.tools";

const logger = createLogger(__filename);

export type OpenAIApiType = "completions" | "responses";
type ResponseOutputItem = OpenAI.Responses.ResponseOutputText | OpenAI.Responses.ResponseOutputRefusal;

export class OpenAIProtocol {
  private openai: OpenAI;
  private connection?: ConnectionParams;

  constructor({ baseURL, apiKey, connection }: { baseURL: string; apiKey: string; connection?: ConnectionParams }) {
    if (!apiKey) {
      logger.warn("API key is not defined.");
    }

    // be used in tools
    this.connection = connection;
    this.openai = new OpenAI({
      apiKey,
      baseURL,
      maxRetries: 10,
    });
  }

  get api(): OpenAI {
    return this.openai;
  }

  async completeChat(
    inputRequest: CompleteChatRequest,
    apiType: OpenAIApiType = "completions"
  ): Promise<ModelResponse> {
    try {
      const response: ModelResponse = {
        type: "text",
        content: "",
      };

      if (apiType === "responses") {
        const params = this.formatResponsesRequest(inputRequest);
        logger.debug({ ...params, input: this.debugResponseInput(params.input) }, "invoking responses...");

        const { usage, output } = await this.openai.responses.create(params);

        const { content, files } = this.parseResponsesOutput(output);

        response.content = content;
        response.files = files.length ? files : undefined;
        response.metadata = {
          usage: {
            inputTokens: usage?.input_tokens || 0,
            outputTokens: usage?.output_tokens || 0,
            cacheReadInputTokens: usage?.input_tokens_details?.cached_tokens || 0,
          },
        };
      } else {
        const params = this.formatCompletionRequest(inputRequest);
        logger.debug({ ...params, messages: [] }, "invoking chat.completions...");

        const completion = await this.openai.chat.completions.create(params);
        logger.debug(completion, "chat.completions response");

        response.content = completion.choices[0]?.message?.content || "";

        const usage = completion.usage;
        response.metadata = {
          usage: {
            inputTokens: usage?.prompt_tokens || 0,
            outputTokens: usage?.completion_tokens || 0,
            cacheReadInputTokens: usage?.prompt_tokens_details?.cached_tokens || 0,
          },
        };
      }

      return response;
    } catch (error: unknown) {
      logger.error(error, "Error calling OpenAI API");
      if (error instanceof OpenAI.APIError) {
        throw new Error(`OpenAI API error: ${error.message}`);
      } else {
        throw error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  // Stream response from OpenAI models
  async streamChatCompletion(
    inputRequest: CompleteChatRequest,
    callbacks: StreamCallbacks,
    apiType: OpenAIApiType = "completions"
  ): Promise<void> {
    callbacks.onStart?.();
    try {
      if (apiType === "responses") {
        await this.streamChatResponses(inputRequest, callbacks);
      } else {
        await this.streamChatCompletionLegacy(inputRequest, callbacks);
      }
    } catch (error) {
      logger.warn(error, "streaming error");
      if (error instanceof OpenAI.APIError) {
        callbacks.onError?.(new Error(`OpenAI API error: ${error.message}`));
      } else {
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  async getEmbeddings(request: GetEmbeddingsRequest): Promise<EmbeddingsResponse> {
    const { modelId, input, dimensions } = request;
    const params: OpenAI.Embeddings.EmbeddingCreateParams = {
      model: modelId,
      input,
      encoding_format: "float",
      dimensions,
    };

    try {
      const response = await this.openai.embeddings.create(params);
      const embedding = response.data[0]?.embedding;
      const usage = response.usage || {};
      return {
        embedding,
        metadata: {
          usage: {
            inputTokens: usage?.prompt_tokens || 0,
          },
        },
      };
    } catch (error: unknown) {
      logger.warn(error, "Error getting embeddings from OpenAI API");
      throw error;
    }
  }

  // Text generation for OpenAI proto
  // https://platform.openai.com/docs/guides/text?api-mode=chat
  private formatMessages(
    modelId: string,
    messages: ModelMessage[],
    systemPrompt: string | undefined
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    type ChatCompletionMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
    type ChatCompletionMessageParamContent = ChatCompletionMessageParam["content"];

    const parseContent = (
      body: string | ModelMessageContent[],
      addImages = true
    ): string | ChatCompletionMessageParamContent => {
      if (typeof body === "string") {
        return body as ChatCompletionMessageParamContent;
      }

      const content = body
        .filter(part => part.content)
        .map(part => {
          if (part.contentType === "text") {
            return { type: "text" as const, text: part.content };
          } else if (addImages && part.contentType === "image") {
            return {
              type: "image_url" as const,
              image_url: {
                url: part.content,
              },
            };
          } else {
            logger.warn({ ...part }, `Unsupported message content type`);
            return null;
          }
        })
        .filter(Boolean);

      return content as ChatCompletionMessageParamContent;
    };

    const requestMessages: ChatCompletionMessageParam[] = messages.flatMap(msg => {
      const role = this.mapMessageRole(msg.role);

      const toolCalls =
        msg.metadata?.toolCalls && msg.metadata.toolCalls.length > 0
          ? [
              {
                role: "assistant" as const,
                tool_calls: msg.metadata.toolCalls
                  .filter(tc => !tc.type || tc.type === "function")
                  .map(tc => ({
                    id: tc.name,
                    type: tc.type || "function",
                    function: {
                      name: tc.name,
                      arguments: JSON.stringify(tc.args || {}),
                    },
                  })),
              },
            ]
          : [];

      const tools =
        msg.metadata?.tools?.map(
          t =>
            ({
              role: "tool" as const,
              tool_call_id: t.callId,
              content: parseContent(t.content, false) || "",
            }) as OpenAI.Chat.Completions.ChatCompletionToolMessageParam
        ) || [];

      return [
        ...toolCalls,
        ...tools,
        {
          role,
          content: parseContent(msg.body),
        },
      ] as ChatCompletionMessageParam[];
    });

    // Add system prompt at the beginning if provided
    let systemRole: "system" | "developer" = "system";
    if (modelId.startsWith("o1") || modelId.startsWith("o4") || modelId.startsWith("gpt-5")) {
      systemRole = "developer";
    }
    if (systemPrompt) {
      requestMessages.unshift({
        role: systemRole,
        content: systemPrompt,
      });
    }

    return requestMessages;
  }

  /**
   * Formats the completion request for the OpenAI API.
   * @param inputRequest The input request containing chat parameters.
   * @returns The formatted completion request parameters.
   */
  private formatCompletionRequest(
    inputRequest: CompleteChatRequest
  ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
    const { systemPrompt, messages = [], modelId, temperature, maxTokens, tools: inputTools } = inputRequest;

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: modelId,
      messages: this.formatMessages(modelId, messages, systemPrompt),
      temperature,
      max_completion_tokens: maxTokens,
    };

    if (modelId.startsWith("o1") || modelId.startsWith("o4")) {
      delete params.temperature;
    } else if (modelId.startsWith("gpt-4o")) {
      delete params.temperature; // GPT-4o models do not support temperature
    } else if (modelId.startsWith("gpt-5")) {
      params.temperature = 1;
    }

    if (inputTools) {
      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];

      // custom web search tool
      if (inputTools.find(t => t.type === ToolType.WEB_SEARCH)) {
        tools.push(WEB_SEARCH_TOOL);
      }

      if (tools.length) {
        params.tools = tools;
      }
    }

    return params;
  }

  private formatResponsesRequest(inputRequest: CompleteChatRequest): OpenAI.Responses.ResponseCreateParamsNonStreaming {
    const { systemPrompt, messages = [], modelId, temperature, maxTokens } = inputRequest;
    const params: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
      model: modelId,
      input: this.formatResponsesInput(messages),
      max_output_tokens: maxTokens,
      instructions: systemPrompt,
      temperature,
    };

    const tools: Array<OpenAI.Responses.Tool> = [];

    if (inputRequest.tools) {
      if (inputRequest.tools.find(t => t.type === ToolType.WEB_SEARCH)) {
        tools.push({ type: "web_search" });
      }
      if (inputRequest.tools.find(t => t.type === ToolType.CODE_INTERPRETER)) {
        tools.push({ type: "code_interpreter", container: { type: "auto" } });
      }
      if (tools.length) {
        params.tools = tools;
      }
    }

    if (modelId.startsWith("o1") || modelId.startsWith("o4")) {
      delete params.temperature;
    } else if (modelId.startsWith("gpt-4o")) {
      delete params.temperature; // GPT-4o models do not support temperature
    } else if (modelId.startsWith("gpt-5")) {
      delete params.temperature;
    }

    return params;
  }

  private formatResponsesInput(messages: ModelMessage[]): OpenAI.Responses.ResponseInput {
    const result: OpenAI.Responses.ResponseInputItem[] = messages.map(msg => {
      let role = this.mapMessageRole(msg.role);

      if (typeof msg.body === "string") {
        return {
          role,
          content: msg.body,
        } as OpenAI.Responses.EasyInputMessage;
      } else {
        const content: OpenAI.Responses.ResponseInputContent[] = msg.body
          .filter(part => part.content)
          .map(part => {
            if (part.contentType === "text") {
              return { type: "input_text" as const, text: part.content };
            } else if (part.contentType === "image") {
              // send previous image as user message to give model more context
              if (role === "assistant") {
                role = "user";
              }

              return {
                type: "input_image" as const,
                image_url: part.content.startsWith("data:image")
                  ? part.content
                  : `data:image/png;base64,${part.content}`,
                detail: "auto" as const,
              };
            } else {
              logger.warn({ ...part }, `Unsupported message content type`);
              return null;
            }
          })
          .filter(notEmpty);

        return {
          role,
          content,
        } as OpenAI.Responses.EasyInputMessage;
      }
    });

    return result;
  }

  private async streamChatCompletionLegacy(
    inputRequest: CompleteChatRequest,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      ...this.formatCompletionRequest(inputRequest),
      stream: true,
      stream_options: { include_usage: true },
    };

    let fullResponse = "";
    let meta: MessageMetadata | undefined = undefined;
    let requestCompleted = false;

    do {
      logger.debug({ ...params }, "invoking streaming chat.completions...");
      const stream = await this.openai.chat.completions.create(params);

      let streamedToolCalls: Array<OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall> = [];
      for await (const chunk of stream) {
        const choice = chunk.choices[0];

        if (choice?.finish_reason === "tool_calls" && (streamedToolCalls.length || choice?.delta?.tool_calls?.length)) {
          const requestedToolCalls = (streamedToolCalls.length ? streamedToolCalls : choice.delta.tool_calls) || [];
          logger.debug({ tool_calls: requestedToolCalls }, "Tool calls requested");
          const toolCalls: ChatCompletionToolCall[] = requestedToolCalls.map(this.parseCompletionToolCall);
          const failedCall = toolCalls.find(call => call.error);

          if (failedCall) {
            callbacks.onError?.(new Error(failedCall.error));
            requestCompleted = true;
            break;
          }

          // TODO: handle other tool calls
          let status =
            toolCalls.length === 1 && toolCalls[0].name === WEB_SEARCH_TOOL_NAME
              ? ResponseStatus.WEB_SEARCH
              : ResponseStatus.TOOL_CALL;
          let detail =
            toolCalls.length === 1
              ? `Arguments: ${JSON.stringify(toolCalls[0].arguments)}`
              : `Call tools: ${toolCalls.map(c => c.name).join(", ")}`;

          const metaCalls = toolCalls.map(c => ({
            ...c,
            name: c.name || "unknown",
            args: JSON.stringify(c.arguments || {}),
          }));
          callbacks.onProgress?.("", { status, detail, toolCalls: metaCalls });

          const toolResults = await this.callCompletionTools(toolCalls);

          // Add tool calls as last assistant message
          params.messages.push({
            role: "assistant",
            tool_calls: requestedToolCalls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
          });
          params.messages.push(...toolResults.map(tr => tr.result));

          const tools: ChatToolCallResult[] = toolResults.map(({ call, result }) => {
            const content = this.parseCompletionToolCallResult(result);
            return {
              name: call.name || "unknown",
              content,
              callId: call.callId,
            };
          });
          callbacks.onProgress?.("", { status: ResponseStatus.TOOL_CALL_COMPLETED, detail, tools });

          requestCompleted = false;
          break; // break for await to restart the request with new messages
        } else {
          requestCompleted = true;
        }

        if (choice?.delta?.tool_calls) {
          choice?.delta?.tool_calls.forEach(tc => {
            if (!streamedToolCalls[tc.index]) {
              streamedToolCalls[tc.index] = tc;
            } else if (streamedToolCalls[tc.index].function && tc.function?.arguments) {
              const func = streamedToolCalls[tc.index].function || {};
              if (!func.arguments) {
                func.arguments = "";
              }
              func.arguments += tc.function.arguments;
            }
          });
        } else {
          const token = choice?.delta?.content || "";
          if (token) {
            fullResponse += token;
            callbacks.onProgress?.(token);
          }
        }

        const usage = chunk.usage;
        if (usage) {
          meta = {
            usage: {
              inputTokens: usage.prompt_tokens || 0,
              outputTokens: usage.completion_tokens || 0,
              cacheReadInputTokens: usage.prompt_tokens_details?.cached_tokens || 0,
            },
          };
        }
      } // for await (const chunk of stream)
    } while (!requestCompleted);

    callbacks.onComplete?.(fullResponse, meta);
  }

  parseCompletionToolCallResult(result: OpenAI.Chat.Completions.ChatCompletionMessageParam): string {
    if (!result.content || typeof result.content === "string") {
      return result.content || "";
    }

    const contentParts: string[] = [];
    result.content.forEach(part => {
      if ("text" in part) {
        contentParts.push(part.text);
      } else if ("refusal" in part) {
        contentParts.push(part.refusal);
      }
    });

    return contentParts.join("\n");
  }

  private async streamChatResponses(inputRequest: CompleteChatRequest, callbacks: StreamCallbacks): Promise<void> {
    const params: OpenAI.Responses.ResponseCreateParamsStreaming = {
      ...this.formatResponsesRequest(inputRequest),
      stream: true,
    };

    logger.debug({ ...params, input: this.debugResponseInput(params.input) }, "invoking streaming responses...");

    const stream = await this.openai.responses.create(params);
    let fullResponse = "";
    let meta: MessageMetadata | undefined = undefined;
    let lastStatus: ResponseStatus | undefined = undefined;
    let toolCall = "";

    for await (const chunk of stream) {
      if (chunk.type == "response.output_text.delta") {
        callbacks.onProgress?.(chunk.delta);
      } else if (
        chunk.type == "response.web_search_call.in_progress" ||
        chunk.type == "response.web_search_call.searching" ||
        chunk.type == "response.web_search_call.completed"
      ) {
        if (lastStatus !== ResponseStatus.WEB_SEARCH) {
          lastStatus = ResponseStatus.WEB_SEARCH;
          callbacks.onProgress?.("", { status: ResponseStatus.WEB_SEARCH });
        }
      } else if (chunk.type == "response.code_interpreter_call.in_progress") {
        if (lastStatus !== ResponseStatus.CODE_INTERPRETER) {
          lastStatus = ResponseStatus.CODE_INTERPRETER;
          callbacks.onProgress?.("", { status: ResponseStatus.CODE_INTERPRETER });
        }
      } else if (chunk.type == "response.code_interpreter_call_code.delta") {
        const delta = toolCall === "" ? "```\n" + chunk.delta : chunk.delta;
        toolCall += delta;

        callbacks.onProgress?.(delta, { status: ResponseStatus.CODE_INTERPRETER });
      } else if (chunk.type == "response.code_interpreter_call.interpreting") {
        toolCall += "\n```";
        logger.debug({ toolCall }, "code interpreter call");
        callbacks.onProgress?.("\n```", { status: ResponseStatus.CODE_INTERPRETER });
        toolCall = "";
      } else if (chunk.type == "response.output_item.done") {
        let status: ResponseStatus | undefined = undefined;
        const item = chunk.item;
        let detail: string | undefined = undefined;
        if ("action" in item) {
          if ("query" in item.action) {
            detail = item.action.query as string;
          }
        }

        if (item.type === "web_search_call") {
          status = ResponseStatus.WEB_SEARCH;
        } else if (item.type === "code_interpreter_call") {
          status = ResponseStatus.CODE_INTERPRETER;
        } else if (item.type === "function_call") {
          status = ResponseStatus.TOOL_CALL;
        } else if (item.type === "reasoning") {
          if (item.content?.length) {
            status = ResponseStatus.REASONING;
          } else {
            status = undefined;
          }
        }

        if (status) {
          lastStatus = status;
          callbacks.onProgress?.("", {
            status,
            sequence_number: chunk.sequence_number,
            detail,
          });
        }
      } else if (chunk.type == "response.completed" || chunk.type == "response.incomplete") {
        const { usage, output } = chunk.response;

        const { content } = this.parseResponsesOutput(output);
        fullResponse = content || "_No response_";

        if (usage) {
          meta = {
            usage: {
              inputTokens: usage.input_tokens || 0,
              outputTokens: usage.output_tokens || 0,
              cacheReadInputTokens: usage.input_tokens_details?.cached_tokens || 0,
            },
          };
        }
      } else if (!["response.output_item.added"].includes(chunk.type)) {
        logger.trace(chunk, `Unhandled response chunk type: ${chunk.type}`);
      }
    }

    callbacks.onComplete?.(fullResponse, meta);
  }

  private parseResponsesOutput(output: OpenAI.Responses.ResponseOutputItem[]): { content: string; files: string[] } {
    const { content, files } = output.reduce(
      (res, item) => {
        if (item.type === "message") {
          res.content += item.content
            .map((c: ResponseOutputItem) => {
              if (c.type === "refusal") {
                return c.refusal;
              }

              let text = c.text || "";

              if (!text && c.annotations?.length) {
                text += "\n### Sources\n";
                const processedSources = new Set<string>();
                c.annotations.forEach((ann, ndx) => {
                  if (ann.type === "url_citation" && ann.url) {
                    if (!processedSources.has(ann.url)) {
                      processedSources.add(ann.url);
                      text += `* [${ann.title || `Source ${ndx + 1}`} ](${ann.url})\n`;
                    }
                  } else if (ann.type === "file_citation" && ann.filename) {
                    if (!processedSources.has(ann.filename)) {
                      processedSources.add(ann.filename);
                      text += `* ${ann.filename}\n`;
                    }
                  }
                });
              }

              return text;
            })
            .join("\n\n");
        } else if (item.type === "image_generation_call") {
          if (item.result) {
            res.files.push(item.result);
          } else {
            res.content += `|Image ${item.id}: ${item.status}|\n\n`;
          }
        }
        return res;
      },
      { content: "", files: [] as string[] }
    );

    return { content, files };
  }

  // Helper method to map our message roles to OpenAI roles
  private mapMessageRole(role: MessageRole): "user" | "assistant" | "developer" {
    switch (role) {
      case MessageRole.USER:
        return "user";
      case MessageRole.ASSISTANT:
      case MessageRole.ERROR:
        return "assistant";
      case MessageRole.SYSTEM:
        return "developer";
      default:
        return "user";
    }
  }

  private debugResponseInput(input: string | OpenAI.Responses.ResponseInput | undefined): any {
    return Array.isArray(input)
      ? input?.map(m => {
          if ("content" in m && Array.isArray(m.content)) {
            return {
              ...m,
              content: m.content.map(c =>
                typeof c === "string"
                  ? (c as string).substring(0, 64)
                  : {
                      ...c,
                      input_text:
                        "input_text" in c && typeof c.input_text === "string"
                          ? c.input_text.substring(0, 64)
                          : undefined,
                      image_url:
                        "image_url" in c && typeof c.image_url === "string" ? c.image_url.substring(0, 32) : undefined,
                    }
              ),
            };
          }

          return m;
        })
      : [];
  }

  private callCompletionTools(
    toolCalls: ChatCompletionToolCall[]
  ): Promise<{ call: ChatCompletionToolCall; result: OpenAI.Chat.Completions.ChatCompletionMessageParam }[]> {
    const requests = toolCalls.map(async call => {
      const tool = COMPLETION_API_TOOLS[call.name || ""];
      if (!tool) {
        return {
          call,
          result: {
            role: "tool" as const,
            tool_call_id: call.callId,
            content: `Error: Unsupported tool: ${call.name}`,
          },
        };
      }

      if (!this.connection) {
        return {
          call,
          result: {
            role: "tool" as const,
            tool_call_id: call.callId,
            content: `Error: external service connection info is not provided.`,
          },
        };
      }

      const result = await tool.call(call.arguments || {}, call.callId, this.connection);
      return { call, result };
    });

    return Promise.all(requests);
  }

  private parseCompletionToolCall(
    call: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall
  ): ChatCompletionToolCall {
    const callId = call.id || "unknown_id";
    if (!call.function || !call.function.name) {
      return {
        callId,
        error: `Invalid tool call format: ${JSON.stringify(call, null, 2)}`,
      };
    }
    const { name } = call.function;
    const tool = COMPLETION_API_TOOLS[call.function.name];
    if (!tool) {
      return {
        callId,
        type: "function",
        error: `Unsupported function tool: ${name}`,
      };
    }

    const toolCall: ChatCompletionToolCall = {
      callId,
      type: "function",
      name,
    };

    if (call.function.arguments) {
      try {
        toolCall.arguments = JSON.parse(call.function.arguments);
      } catch (e) {
        toolCall.error = `Failed to parse tool call arguments: ${e}`;
      }
    }

    return toolCall;
  }
}
