import OpenAI from "openai";
import { Stream } from "openai/core/streaming";

import {
  ModelMessage,
  ModelResponse,
  StreamCallbacks,
  CompleteChatRequest,
  MessageMetadata,
  MessageRole,
  GetEmbeddingsRequest,
  EmbeddingsResponse,
  ToolType,
  ResponseStatus,
  ModelMessageContent,
  ChatToolCallResult,
  ChatResponseStatus,
  ChatTool,
} from "@/types/ai.types";
import { createLogger } from "@/utils/logger";
import { notEmpty, ok } from "@/utils/assert";
import { ConnectionParams } from "@/middleware/auth.middleware";
import {
  ChatCompletionToolCall,
  ChatCompletionToolCallable,
  formatOpenAIMcpTools,
  formatResponsesMcpTools,
  ResponsesMcpToolCallable,
  CustomWebSearchTool,
} from "./openai.tools";
import { FileContentLoader } from "@/services/data";
import { ModelProtocol } from "./common";
import { MCPServer } from "@/entities";

const logger = createLogger(__filename);

const RETRY_TIMEOUT_MS = 100;
const RETRY_COUNT = 10;

export type OpenAIApiType = "completions" | "responses";
type ResponseOutputItem = OpenAI.Responses.ResponseOutputText | OpenAI.Responses.ResponseOutputRefusal;

function genProcessSymbol(): string {
  const symbols = ["📲", "🖥️", "💻", "💡", "🤖", "🟢"];
  return symbols[Math.floor(Math.random() * symbols.length)];
}

export class OpenAIProtocol implements ModelProtocol {
  private apiType: OpenAIApiType;
  private openai: OpenAI;
  private connection?: ConnectionParams;
  private fileLoader?: FileContentLoader;
  private modelIdOverride?: string;

  constructor({
    apiType,
    baseURL,
    apiKey,
    modelIdOverride,
    connection,
    fileLoader,
  }: {
    apiType: OpenAIApiType;
    baseURL: string;
    apiKey: string;
    modelIdOverride?: string;
    connection?: ConnectionParams;
    fileLoader?: FileContentLoader;
  }) {
    if (!apiKey) {
      logger.warn("API key is not defined.");
    }

    this.apiType = apiType;

    // be used in tools
    this.connection = connection;
    this.fileLoader = fileLoader;
    this.modelIdOverride = modelIdOverride;

    this.openai = new OpenAI({
      apiKey,
      baseURL,
      maxRetries: 10,
    });
  }

  get api(): OpenAI {
    return this.openai;
  }

  public async completeChat(input: CompleteChatRequest, messages: ModelMessage[] = []): Promise<ModelResponse> {
    try {
      const response: ModelResponse = {
        type: "text",
        content: "",
      };

      if (this.apiType === "responses") {
        const params = await this.formatResponsesRequest(input, messages);
        logger.debug({ ...params, input: this.debugResponseInput(params.input) }, "invoking responses...");

        const result = await this.openai.responses.create(params);
        const { content, files, metadata } = this.parseResponsesOutput(result);

        response.content = content;
        response.files = files.length ? files : undefined;
        response.metadata = metadata;
      } else {
        const params = await this.formatCompletionRequest(input, messages);
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
  public async streamChatCompletion(
    inputRequest: CompleteChatRequest,
    messages: ModelMessage[] = [],
    callbacks: StreamCallbacks
  ): Promise<void> {
    try {
      if (this.apiType === "responses") {
        await this.streamChatResponses(inputRequest, messages, callbacks);
      } else {
        await this.streamChatCompletionLegacy(inputRequest, messages, callbacks);
      }
    } catch (error) {
      logger.warn(error, "Streaming error");

      if (error instanceof OpenAI.APIError) {
        await callbacks.onError(new Error(`OpenAI API error: ${error.message}`));
      } else {
        await callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  async getEmbeddings(request: GetEmbeddingsRequest, retry: number = 0): Promise<EmbeddingsResponse> {
    const { modelId: requestModelId, input, dimensions } = request;
    const modelId = this.modelIdOverride || requestModelId;

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
      if (error instanceof OpenAI.APIError && error.code === "rate_limit_exceeded" && retry < RETRY_COUNT) {
        return new Promise(res => setTimeout(res, RETRY_TIMEOUT_MS)).then(() => this.getEmbeddings(request, retry + 1));
      }

      logger.warn(error, "Error getting embeddings from OpenAI API");
      throw error;
    }
  }

  // Text generation for OpenAI proto
  // https://platform.openai.com/docs/guides/text?api-mode=chat
  private async formatMessages(
    modelId: string,
    messages: ModelMessage[],
    systemPrompt: string | undefined
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
    type ChatCompletionMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
    type ChatCompletionContentPartText = OpenAI.Chat.Completions.ChatCompletionContentPartText;
    type ChatCompletionContentPart = OpenAI.Chat.Completions.ChatCompletionContentPart;

    const parseContent = async (
      body: string | ModelMessageContent[],
      addImages = true
    ): Promise<string | ChatCompletionContentPart[]> => {
      if (typeof body === "string") {
        return body;
      }

      const parts: ChatCompletionContentPart[] = [];

      for (const part of body) {
        if (part.contentType === "text") {
          parts.push({ type: "text" as const, text: part.content });
          continue;
        }

        if (addImages && part.contentType === "image") {
          if (!this.fileLoader) {
            logger.warn(`File loader is not connected, cannot load image content: ${part.fileName}`);
            continue;
          }

          const fileData = await this.fileLoader.getFileContent(part.fileName);
          const fileContent = fileData.toString("base64");

          parts.push({
            type: "image_url" as const,
            image_url: {
              url: `data:${part.mimeType || "image/png"};base64,${fileContent}`,
            },
          });

          continue;
        }

        logger.warn(part, `Unsupported message content type`);
      }

      return parts;
    };

    const requestMessages: ChatCompletionMessageParam[] = [];

    for (const msg of messages) {
      const role = this.mapMessageRole(msg.role);

      const toolCalls =
        msg.metadata?.toolCalls && msg.metadata.toolCalls.length > 0
          ? [
              {
                role: "assistant" as const,
                tool_calls: msg.metadata.toolCalls
                  .filter(tc => !tc.type || tc.type === "function")
                  .map(tc => ({
                    id: tc.callId,
                    type: "function" as const,
                    function: {
                      name: tc.name,
                      arguments: JSON.stringify(tc.args || {}),
                    },
                  })),
              },
            ]
          : [];

      const tools: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];
      if (msg.metadata?.tools) {
        for (const tool of msg.metadata.tools) {
          tools.push({
            role: "tool" as const,
            tool_call_id: tool.callId || "",
            content: ((await parseContent(tool.content, false)) || "") as string | Array<ChatCompletionContentPartText>,
          });
        }
      }

      requestMessages.push(...toolCalls, ...tools, {
        role,
        content: await parseContent(msg.body),
      } as ChatCompletionMessageParam);
    }

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
  private async formatCompletionRequest(
    inputRequest: CompleteChatRequest,
    messages: ModelMessage[] = []
  ): Promise<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming> {
    const { systemPrompt, modelId: requestModelId, temperature, maxTokens, tools, mcpServers } = inputRequest;
    const modelId = this.modelIdOverride || requestModelId;

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: modelId,
      messages: await this.formatMessages(modelId, messages, systemPrompt),
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

    const requestTools = this.formatRequestTools(tools, mcpServers);
    if (requestTools.length) {
      params.tools = requestTools;
    }

    return params;
  }

  private formatRequestTools(inputTools?: ChatTool[], mcpServers?: MCPServer[]): ChatCompletionToolCallable[] {
    if (inputTools?.length) {
      const tools: ChatCompletionToolCallable[] = [];

      // custom web search tool
      if (inputTools.find(t => t.type === ToolType.WEB_SEARCH)) {
        tools.push(CustomWebSearchTool);
      }
      const mcpTools = formatOpenAIMcpTools(
        inputTools.filter(t => t.type === ToolType.MCP),
        mcpServers
      );
      tools.push(...mcpTools);

      return tools;
    }

    return [];
  }

  private async formatResponsesRequest(
    inputRequest: CompleteChatRequest,
    messages: ModelMessage[] = []
  ): Promise<OpenAI.Responses.ResponseCreateParamsNonStreaming> {
    const { systemPrompt, modelId: requestModelId, temperature, maxTokens, mcpServers } = inputRequest;
    const modelId = this.modelIdOverride || requestModelId;

    const params: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
      model: modelId,
      input: await this.formatResponsesInput(messages),
      max_output_tokens: maxTokens,
      instructions: systemPrompt,
      temperature,
    };

    const tools: Array<OpenAI.Responses.Tool> = [];

    if (inputRequest.tools) {
      if (inputRequest.tools.find(t => t.type === ToolType.WEB_SEARCH)) {
        tools.push({
          type: "web_search",
          search_context_size: "low",
        });
      }

      if (inputRequest.tools.find(t => t.type === ToolType.CODE_INTERPRETER)) {
        tools.push({ type: "code_interpreter", container: { type: "auto" } });
      }

      // TODO: Use MCP tools as function tools when OAuth is supported, or check
      // how to load `authorization` token
      // const mcpTools = formatResponsesMcpTools(
      //   inputRequest.tools.filter(t => t.type === ToolType.MCP),
      //   mcpServers
      // );
      // tools.push(...mcpTools);
      const serverMap = new Map(mcpServers?.map(server => [server.id, server]) || []);

      inputRequest.tools
        .filter(t => t.type === ToolType.MCP)
        .forEach(tool => {
          const server = serverMap.get(tool.id || tool.name);
          ok(server);

          tools.push({
            type: "mcp",
            server_url: server.url,
            server_label: "M_" + server.id,
            server_description: server.description,
            require_approval: "never", // for now we handle approval
          });
        });

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

  private async formatResponsesInput(messages: ModelMessage[]): Promise<OpenAI.Responses.ResponseInput> {
    const result: OpenAI.Responses.ResponseInputItem[] = [];

    for (const msg of messages) {
      let role = this.mapMessageRole(msg.role);

      if (typeof msg.body === "string") {
        result.push({
          role,
          content: msg.body,
        } as OpenAI.Responses.EasyInputMessage);

        continue;
      }

      const content: OpenAI.Responses.ResponseInputContent[] = [];

      for (const part of msg.body) {
        if (part.contentType === "text") {
          content.push({ type: "input_text" as const, text: part.content });
        } else if (part.contentType === "image") {
          // send previous image as user message to give model more context
          if (role === "assistant") {
            role = "user";
          }

          if (!this.fileLoader) {
            logger.warn(`File loader is not connected, cannot load image content: ${part.fileName}`);
            continue;
          }

          const fileData = await this.fileLoader.getFileContent(part.fileName);
          const fileContent = fileData.toString("base64");

          content.push({
            type: "input_image" as const,
            image_url: `data:${part.mimeType || "image/png"};base64,${fileContent}`,
            detail: "auto" as const,
          });
        } else {
          logger.warn(part, `Unsupported message content type`);
        }
      }

      result.push({
        role,
        content,
      } as OpenAI.Responses.EasyInputMessage);
    }

    return result;
  }

  private async streamChatCompletionLegacy(
    input: CompleteChatRequest,
    messages: ModelMessage[] = [],
    callbacks: StreamCallbacks
  ): Promise<void> {
    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      ...(await this.formatCompletionRequest(input, messages)),
      stream: true,
      stream_options: { include_usage: true },
    };

    let fullResponse = "";
    let meta: MessageMetadata | undefined = undefined;

    let stopped = await callbacks.onStart();
    if (stopped) {
      return await callbacks.onComplete(
        {
          type: "text",
          content: fullResponse,
        },
        meta
      );
    }

    const callableTools = this.formatRequestTools(input.tools, input.mcpServers);

    do {
      logger.debug({ ...params }, "invoking streaming chat.completions...");
      const stream = await this.openai.chat.completions.create(params);

      let streamedToolCalls: Array<OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall> = [];

      for await (const chunk of stream) {
        if (stopped) {
          stream?.controller?.abort();
          break;
        }

        logger.trace(chunk, "got chunk");
        const choice = chunk.choices?.[0];

        if (choice?.finish_reason === "tool_calls" && (streamedToolCalls.length || choice?.delta?.tool_calls?.length)) {
          const requestedToolCalls = (streamedToolCalls.length ? streamedToolCalls : choice.delta.tool_calls) || [];
          logger.debug({ tool_calls: requestedToolCalls }, "Tool calls requested");
          const toolCalls: ChatCompletionToolCall[] = requestedToolCalls.map(call =>
            this.parseCompletionToolCall(call, callableTools)
          );
          const failedCall = toolCalls.find(call => call.error);

          if (failedCall) {
            await callbacks.onError(new Error(failedCall.error));
            stopped = true;
            break;
          }

          const metaCalls = toolCalls.map(c => ({
            ...c,
            name: c.name || "unknown",
            args: JSON.stringify(c.arguments || {}),
          }));
          stopped = await callbacks.onProgress(genProcessSymbol(), {
            status: ResponseStatus.TOOL_CALL,
            toolCalls: metaCalls,
          });

          if (stopped) {
            break;
          }

          const toolResults = await this.callCompletionTools(toolCalls, callableTools, callbacks.onProgress);

          // Add tool calls as last assistant message
          params.messages.push({
            role: "assistant",
            tool_calls: requestedToolCalls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
          });
          params.messages.push(...toolResults.map(tr => tr.result));

          const tools: ChatToolCallResult[] = toolResults
            .map(({ call, result }) => {
              if (!result) return undefined;
              const content = this.parseCompletionToolCallResult(result);
              return {
                name: call.name || "unknown",
                content,
                callId: call.callId,
              };
            })
            .filter(notEmpty);

          await callbacks.onProgress("", { status: ResponseStatus.TOOL_CALL_COMPLETED, tools });

          stopped = toolResults.some(tr => tr.stopped);
          break; // break for await to restart the request with new messages
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
          const token = choice?.delta?.content || (choice?.delta as any)?.reasoning_content || "";
          if (token) {
            fullResponse += token;
            stopped = await callbacks.onProgress(token);
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

        if (!stopped && choice?.finish_reason === "stop") {
          stopped = true;
        }
      } // for await (const chunk of stream)
    } while (!stopped);

    await callbacks.onComplete(
      {
        type: "text",
        content: fullResponse,
      },
      meta
    );
  }

  private parseCompletionToolCallResult(result: OpenAI.Chat.Completions.ChatCompletionMessageParam): string {
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

  private async streamChatResponses(
    inputRequest: CompleteChatRequest,
    messages: ModelMessage[],
    callbacks: StreamCallbacks,
    retry: number = 0
  ): Promise<void> {
    const params: OpenAI.Responses.ResponseCreateParamsStreaming = {
      ...(await this.formatResponsesRequest(inputRequest, messages)),
      stream: true,
      background: true, // to cancel it
    };

    if (logger.isLevelEnabled("trace")) {
      logger.trace({ ...params, input: this.debugResponseInput(params.input) }, "invoking streaming responses...");
    }

    let fullResponse = "";
    let meta: MessageMetadata = {};
    let lastStatus: ResponseStatus | undefined = undefined;

    await callbacks.onStart();

    let stream: Stream<OpenAI.Responses.ResponseStreamEvent>;
    try {
      stream = await this.openai.responses.create(params);
    } catch (error) {
      if (error instanceof OpenAI.APIError && error.code === "rate_limit_exceeded" && retry < RETRY_COUNT) {
        return new Promise(res => setTimeout(res, RETRY_TIMEOUT_MS)).then(() =>
          this.streamChatResponses(inputRequest, messages, callbacks, retry + 1)
        );
      }

      throw error;
    }

    let stopped: boolean | undefined = false;

    try {
      for await (const chunk of stream) {
        if (stopped) break;

        logger.trace(chunk, "got responses chunk");

        if (chunk.type == "response.created") {
          stopped = await callbacks.onProgress("", {
            status: ResponseStatus.STARTED,
            requestId: chunk.response.id,
          });
        } else if (chunk.type == "response.output_text.delta") {
          stopped = await callbacks.onProgress(chunk.delta, { status: ResponseStatus.IN_PROGRESS });
          fullResponse += chunk.delta;
        } else if (
          chunk.type == "response.web_search_call.in_progress" ||
          chunk.type == "response.web_search_call.searching" ||
          chunk.type == "response.web_search_call.completed"
        ) {
          if (lastStatus !== ResponseStatus.WEB_SEARCH) {
            lastStatus = ResponseStatus.WEB_SEARCH;
            stopped = await callbacks.onProgress("", { status: ResponseStatus.WEB_SEARCH });
          }
        } else if (
          chunk.type == "response.mcp_list_tools.in_progress" ||
          chunk.type == "response.mcp_call.in_progress"
        ) {
          stopped = await callbacks.onProgress("", {
            status: ResponseStatus.MCP_CALL,
            detail: chunk.type == "response.mcp_list_tools.in_progress" ? "Loading MCP tools..." : undefined,
          });
        } else if (chunk.type == "response.code_interpreter_call.in_progress") {
          if (lastStatus !== ResponseStatus.CODE_INTERPRETER) {
            lastStatus = ResponseStatus.CODE_INTERPRETER;
            stopped = await callbacks.onProgress("", { status: ResponseStatus.CODE_INTERPRETER });
          }
        } else if (chunk.type == "response.code_interpreter_call_code.delta") {
          stopped = await callbacks.onProgress("", { status: ResponseStatus.CODE_INTERPRETER });
        } else if (chunk.type == "response.code_interpreter_call.interpreting") {
          stopped = await callbacks.onProgress(genProcessSymbol(), { status: ResponseStatus.CODE_INTERPRETER });
        } else if (chunk.type == "response.code_interpreter_call_code.done") {
          logger.debug(chunk, "code interpreter call completed");
          stopped = await callbacks.onProgress("", {
            status: ResponseStatus.CODE_INTERPRETER,
            tools: [
              {
                name: "code_interpreter",
                content: chunk.code || "",
                callId: chunk.item_id,
              },
            ],
          });
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
            if (item.summary?.length || item.content?.length) {
              status = ResponseStatus.REASONING;
            } else {
              status = undefined;
            }
          }

          if (status) {
            lastStatus = status;
            stopped = await callbacks.onProgress("", {
              status,
              sequence_number: chunk.sequence_number,
              detail,
            });
          }
        } else if (
          chunk.type == "response.output_text.annotation.added" &&
          chunk.annotation &&
          typeof chunk.annotation === "object"
        ) {
          if (!("type" in chunk.annotation)) return;

          if (!meta.annotations) {
            meta.annotations = [];
          }

          if (chunk.annotation.type === "url_citation") {
            const annotation = chunk.annotation as {
              start_index?: number;
              end_index?: number;
              type: string;
              title?: string;
              url: string;
            };
            meta.annotations.push({
              type: "url",
              title: annotation.title,
              source: annotation.url,
              endIndex: annotation.end_index,
              startIndex: annotation.start_index,
            });
          } else if (chunk.annotation.type === "file_citation") {
            const annotation = chunk.annotation as { file_id: string; filename: string; type: string };
            meta.annotations.push({
              type: "file",
              title: annotation.filename,
              source: annotation.file_id,
            });
          }
        } else if (chunk.type == "response.completed" || chunk.type == "response.incomplete") {
          const { content, metadata } = this.parseResponsesOutput(chunk.response);
          if (metadata) {
            meta = {
              ...meta,
              ...metadata,
            };
          }

          if (content) {
            fullResponse = content;
          }
        } else if (!["response.output_item.added"].includes(chunk.type)) {
          logger.trace(chunk, `Unhandled response chunk type: ${chunk.type}`);
        }
      }
    } catch (err: unknown) {
      stopped = await callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }

    if (stopped) {
      stream?.controller?.abort(); // ensure stopping the background request
    }
    await callbacks.onComplete(
      {
        type: "text",
        content: fullResponse || (stopped ? "_Cancelled_" : "_No response_"),
      },
      meta
    );
  }

  private parseResponsesOutput(response: OpenAI.Responses.Response): {
    content: string;
    files: string[];
    metadata: MessageMetadata;
  } {
    const { output, usage } = response;

    let metadata: MessageMetadata = {
      usage: {
        inputTokens: usage?.input_tokens || 0,
        outputTokens: usage?.output_tokens || 0,
        cacheReadInputTokens: usage?.input_tokens_details?.cached_tokens || 0,
      },
    };

    const { content, files } = output.reduce(
      (res, item) => {
        if (item.type === "message") {
          res.content += item.content
            .map((c: ResponseOutputItem) => {
              if (c.type === "refusal") {
                return c.refusal;
              }

              let text = c.text || "";
              const extendText = !text;

              if (c.annotations?.length) {
                metadata.annotations = metadata.annotations || [];
                if (extendText) {
                  text += "\n### Sources\n";
                }

                const processedSources = new Set<string>();
                c.annotations.forEach((ann, ndx) => {
                  if (ann.type === "url_citation" && ann.url) {
                    if (extendText && !processedSources.has(ann.url)) {
                      processedSources.add(ann.url);
                      text += `* [${ann.title || `Source ${ndx + 1}`} ](${ann.url})\n`;
                    }

                    ok(metadata.annotations);
                    metadata.annotations.push({
                      type: "url",
                      title: ann.title,
                      source: ann.url,
                      endIndex: ann.end_index,
                      startIndex: ann.start_index,
                    });
                  } else if (ann.type === "file_citation") {
                    if (extendText && !processedSources.has(ann.filename)) {
                      processedSources.add(ann.filename);
                      text += `* ${ann.filename}\n`;
                    }

                    ok(metadata.annotations);
                    metadata.annotations.push({
                      type: "file",
                      title: ann.filename,
                      source: ann.file_id,
                    });
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

    return { content, files, metadata };
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
    toolCalls: ChatCompletionToolCall[],
    tools: ChatCompletionToolCallable[],
    onProgress?:
      | ((token: string, status?: ChatResponseStatus, force?: boolean) => Promise<boolean | undefined>)
      | undefined
  ): Promise<
    {
      call: ChatCompletionToolCall;
      result: OpenAI.Chat.Completions.ChatCompletionMessageParam;
      stopped: boolean | undefined;
    }[]
  > {
    const requests = toolCalls.map(async call => {
      const tool = tools.find(t => t.name === call.name);
      if (!tool) {
        return {
          call,
          stopped: true,
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
          stopped: true,
          result: {
            role: "tool" as const,
            tool_call_id: call.callId,
            content: `Error: external service connection info is not provided.`,
          },
        };
      }

      let status = tool.status || ResponseStatus.TOOL_CALL;
      let detail = call.arguments ? JSON.stringify(call.arguments) : "";
      const stopped = await onProgress?.("", { status, detail });
      if (stopped) {
        return {
          call,
          result: {
            role: "tool" as const,
            tool_call_id: call.callId,
            content: "",
          },
          stopped,
        };
      }
      const result = await tool.call(call.arguments || {}, call.callId, this.connection);
      return { call, result, stopped };
    });

    return Promise.all(requests);
  }

  private parseCompletionToolCall(
    call: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall,
    tools: ChatCompletionToolCallable[]
  ): ChatCompletionToolCall {
    const callId = call.id || "unknown_id";
    if (!call.function || !call.function.name) {
      return {
        callId,
        error: `Invalid tool call format: ${JSON.stringify(call, null, 2)}`,
      };
    }
    const { name } = call.function;
    const tool = tools.find(t => t.name === name);

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

  /**
   * Stop a running request by request ID.
   * Only works with OpenAI responses API (background: true).
   */
  public async stopRequest(requestId: string): Promise<void> {
    try {
      await this.openai.responses.cancel(requestId);
    } catch (error) {
      logger.error(error, `Failed to stop request ${requestId}`);
    }
  }
}
