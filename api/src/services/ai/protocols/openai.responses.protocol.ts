import OpenAI from "openai";
import { Stream } from "openai/core/streaming";
import {
  ModelMessage,
  ModelResponse,
  StreamCallbacks,
  CompleteChatRequest,
  MessageMetadata,
  IMCPServer,
  ChatTool,
  ChatToolCallResult,
} from "@/types/ai.types";
import { MCPAuthType, ModelFeature, ResponseStatus, ToolType } from "@/types/api";
import { createLogger } from "@/utils/logger";
import { notEmpty, ok } from "@/utils/assert";
import { ChatCompletionToolCall, ChatCompletionToolCallable, formatOpenAIMcpTools } from "./openai.tools";
import { OpenAIProtocolBase, OpenAIProtocolOptions, RETRY_COUNT, RETRY_TIMEOUT_MS } from "./openai.protocol";
import { MCP_DEFAULT_API_KEY_HEADER } from "@/entities/MCPServer";
import { globalConfig } from "@/global-config";
import { IMAGE_BASE64_TPL, IMAGE_MARKDOWN_TPL } from "@/config/ai/templates";
import { sanitizeSurrogates } from "@/utils/format";

const logger = createLogger(__filename);

type ResponseOutputItem = OpenAI.Responses.ResponseOutputText | OpenAI.Responses.ResponseOutputRefusal;

export class OpenAIResponsesProtocol extends OpenAIProtocolBase {
  constructor(options: OpenAIProtocolOptions) {
    super(options);
  }

  get type(): "responses" {
    return "responses";
  }

  async completeChat(input: CompleteChatRequest, messages: ModelMessage[] = []): Promise<ModelResponse> {
    try {
      const contextMessages = messages.map(m => m.id).filter(notEmpty);
      const params = await this.formatResponsesRequest(input, messages);

      if (logger.isLevelEnabled("trace")) {
        logger.trace({ ...params, input: this.debugResponseInput(params.input) }, "invoking synchronous responses...");
      }

      const result = await this.openai.responses.create(params);
      const { content, images, metadata } = this.parseResponsesOutput(result);

      return {
        content,
        images: images.length ? images : undefined,
        metadata: { ...metadata, contextMessages },
      };
    } catch (error: unknown) {
      logger.error(error, "Error calling OpenAI Responses API");
      if (error instanceof OpenAI.APIError) {
        throw new Error(`OpenAI API error: ${error.message}`);
      } else {
        throw error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  async streamChatCompletion(
    inputRequest: CompleteChatRequest,
    messages: ModelMessage[] = [],
    callbacks: StreamCallbacks
  ): Promise<void> {
    try {
      await this.streamChatResponses(inputRequest, messages, callbacks);
    } catch (error) {
      logger.warn(error, "Streaming error");
      if (error instanceof OpenAI.APIError) {
        await callbacks.onError(new Error(`OpenAI API error: ${error.message}`));
      } else {
        await callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  async stopRequest(requestId: string): Promise<void> {
    try {
      await this.openai.responses.cancel(requestId);
    } catch (error) {
      logger.error(error, `Failed to stop request ${requestId}`);
    }
  }

  private async formatResponsesRequest(
    inputRequest: CompleteChatRequest,
    messages: ModelMessage[] = []
  ): Promise<OpenAI.Responses.ResponseCreateParamsNonStreaming> {
    const { modelId: requestModelId, modelFeatures = [], mcpServers, mcpTokens, settings = {} } = inputRequest;
    const {
      systemPrompt,
      temperature,
      maxTokens,
      thinking,
      thinkingBudget,
      imageOrientation,
      imageQuality,
      cacheRetention,
    } = settings;
    const modelId = this.modelIdOverride || requestModelId;

    const params: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
      model: modelId,
      input: await this.formatResponsesInput(messages),
      max_output_tokens: maxTokens ? Math.max(maxTokens, 16) : undefined,
      instructions: systemPrompt,
      temperature,
    };

    if (cacheRetention && cacheRetention !== "none") {
      params.prompt_cache_key = inputRequest.cacheId || inputRequest.requestId || undefined;
      if (cacheRetention === "long" && this.openai.baseURL?.includes("api.openai.com")) {
        params.prompt_cache_retention = "24h";
      }
    }

    if (thinking) {
      const maxTokenBudget = globalConfig.ai.reasoningMaxTokenBudget;
      const budget = thinkingBudget || globalConfig.ai.reasoningMinTokenBudget;

      const effort =
        budget < maxTokenBudget * 0.1
          ? "minimal"
          : budget < maxTokenBudget * 0.25
            ? "low"
            : budget < maxTokenBudget * 0.75
              ? "medium"
              : "high";
      params.reasoning = {
        effort,
        summary: "auto",
      };
    } else if (modelFeatures.includes(ModelFeature.REASONING)) {
      if (["gpt-5-mini", "gpt-5"].includes(modelId)) {
        params.reasoning = {
          effort: "minimal",
        };
      } else {
        params.reasoning = {
          effort: "none",
        };
      }
    }

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

      if (inputRequest.tools.find(t => t.type === ToolType.IMAGE_GENERATION)) {
        let size: "1024x1024" | "1024x1536" | "1536x1024" | "auto" = "1024x1024" as const;
        const quality: "low" | "medium" | "high" | "auto" = imageQuality || "auto";

        if (imageOrientation) {
          switch (imageOrientation) {
            case "landscape":
              size = "1536x1024";
              break;
            case "portrait":
              size = "1024x1536";
              break;
            default:
              size = "1024x1024";
          }
        }

        tools.push({
          type: "image_generation",
          partial_images: 2,
          size,
          quality,
        });
      }

      const serverMap = new Map(mcpServers?.map(server => [server.id, server]) || []);
      const localMcpServers: { server: IMCPServer; tool: ChatTool }[] = [];

      inputRequest.tools
        .filter(t => t.type === ToolType.MCP)
        .forEach(tool => {
          const server = serverMap.get(tool.id || tool.name);
          ok(server);

          if (server.url?.startsWith("http://localhost") || server.url?.startsWith("http://127.0.0.1")) {
            localMcpServers.push({ server, tool });
            return;
          }

          const mcpTool: OpenAI.Responses.Tool.Mcp = {
            type: "mcp",
            server_url: server.url,
            server_label: "M_" + server.id,
            server_description: server.description,
            require_approval: "never",
          };

          if (server.authType !== MCPAuthType.NONE) {
            const token = mcpTokens?.find(t => t.serverId === server.id);
            if (server.authType === MCPAuthType.BEARER || server.authType === MCPAuthType.OAUTH2) {
              mcpTool.authorization = token?.accessToken;
            } else if (server.authType === MCPAuthType.API_KEY) {
              mcpTool.headers = {
                [server.authConfig?.headerName || MCP_DEFAULT_API_KEY_HEADER]: token?.accessToken || "",
              };
            }
          }

          tools.push(mcpTool);
        });

      const localTools: Array<OpenAI.Responses.FunctionTool> = formatOpenAIMcpTools(
        localMcpServers.map(s => s.tool),
        localMcpServers.map(s => s.server)
      )
        .filter(t => t.type === "function")
        .map((t: OpenAI.Chat.Completions.ChatCompletionFunctionTool) => {
          const fn = t.function;
          return {
            type: "function" as const,
            name: fn.name,
            description: fn.description,
            parameters: fn.parameters as Record<string, unknown>,
            strict: fn.strict ?? false,
          };
        });

      tools.push(...localTools);
    }

    if (tools.length) {
      params.tools = tools;
    }

    if (modelId.startsWith("o1") || modelId.startsWith("o4")) {
      delete params.temperature;
    } else if (modelId.startsWith("gpt-4o")) {
      delete params.temperature;
    } else if (modelId.startsWith("gpt-5")) {
      delete params.temperature;
    }

    return this.paramsProcessor ? this.paramsProcessor.responsesRequest(inputRequest, params) : params;
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
          content.push({ type: "input_text" as const, text: sanitizeSurrogates(part.content) });
        } else if (part.contentType === "image") {
          if (role === "assistant") {
            role = "user";
          }

          if (!this.fileLoader) {
            logger.warn(`File loader is not connected, cannot load image content: ${part.fileName}`);
            continue;
          }

          const fileContent = await this.fileLoader.getFileContentBase64(part.fileName);
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

  private async streamChatResponses(
    inputRequest: CompleteChatRequest,
    messages: ModelMessage[],
    callbacks: StreamCallbacks,
    retry: number = 0
  ): Promise<void> {
    const baseParams: OpenAI.Responses.ResponseCreateParamsStreaming = {
      ...(await this.formatResponsesRequest(inputRequest, messages)),
      stream: true,
      background: true,
    };
    const callableTools = this.getResponsesCallableTools(baseParams.tools || [], inputRequest.mcpServers || []);
    let lastResponseId: string | undefined;

    if (logger.isLevelEnabled("trace")) {
      logger.trace(
        { ...baseParams, input: this.debugResponseInput(baseParams.input) },
        "invoking streaming responses..."
      );
    }

    let fullResponse = "";
    let partResponse = "";
    let meta: MessageMetadata = {
      contextMessages: messages.map(m => m.id).filter(notEmpty),
    };
    let lastStatus: ResponseStatus | undefined = undefined;

    let stream: Stream<OpenAI.Responses.ResponseStreamEvent>;
    try {
      if (inputRequest.requestId) {
        stream = await this.openai.responses.retrieve(inputRequest.requestId, {
          stream: true,
          starting_after: inputRequest.lastSequenceNumber,
        });
      } else {
        stream = await this.openai.responses.create(baseParams);
      }

      await callbacks.onStart({ status: ResponseStatus.STARTED });
    } catch (error: unknown) {
      if (this.errorProcessor.isRateLimitError(error) && retry < RETRY_COUNT) {
        return new Promise(res => setTimeout(res, RETRY_TIMEOUT_MS)).then(() =>
          this.streamChatResponses(inputRequest, messages, callbacks, retry + 1)
        );
      }

      if (this.errorProcessor.isInputTooLargeError(error) && retry < RETRY_COUNT) {
        if (messages.length > 1) {
          await callbacks.onProgress("", {
            status: ResponseStatus.IN_PROGRESS,
            detail: "Compacting conversation history",
          });

          const lastMessages = messages.slice(-Math.floor(messages.length / 2));
          return this.streamChatResponses(inputRequest, lastMessages, callbacks, retry + 1);
        }
      }

      throw error;
    }

    let stopped: boolean | undefined = false;
    let started = false;
    let requestId: string | undefined = inputRequest.requestId;
    const images: string[] = [];
    const cyclesLimit = 20;
    let cycleNo = 0;

    try {
      const progressInfo: import("@/types/ai.types").ChatResponseStatus = {
        requestId,
      };

      do {
        const pendingFunctionCalls: Array<{ name: string; callId: string; arguments: string }> = [];

        for await (const chunk of stream) {
          if (stopped) break;

          logger.trace(chunk, "got responses chunk");
          progressInfo.sequenceNumber = chunk.sequence_number;

          if (chunk.type == "response.created" || chunk.type == "response.queued") {
            if (!started) {
              progressInfo.requestId = chunk.response.id;
              stopped = await callbacks.onProgress(
                "",
                {
                  status: ResponseStatus.STARTED,
                  queue: inputRequest.requestPolling,
                  ...progressInfo,
                },
                true
              );
              started = true;
            }
          } else if (chunk.type == "response.in_progress") {
            stopped = await callbacks.onProgress("", { status: ResponseStatus.IN_PROGRESS, ...progressInfo }, true);
          } else if (chunk.type == "response.content_part.done") {
            // do nothing for now
          } else if (chunk.type == "response.output_text.delta") {
            stopped = await callbacks.onProgress(chunk.delta, {
              status: ResponseStatus.IN_PROGRESS,
              ...progressInfo,
            });
            fullResponse += chunk.delta;
          } else if (
            chunk.type == "response.web_search_call.in_progress" ||
            chunk.type == "response.web_search_call.searching" ||
            chunk.type == "response.web_search_call.completed"
          ) {
            if (lastStatus !== ResponseStatus.WEB_SEARCH) {
              lastStatus = ResponseStatus.WEB_SEARCH;
              stopped = await callbacks.onProgress("", {
                status: ResponseStatus.WEB_SEARCH,
                ...progressInfo,
              });
            }
          } else if (
            chunk.type == "response.mcp_list_tools.in_progress" ||
            chunk.type == "response.mcp_call.in_progress"
          ) {
            stopped = await callbacks.onProgress("", {
              status: ResponseStatus.MCP_CALL,
              detail: chunk.type == "response.mcp_list_tools.in_progress" ? "Loading MCP tools..." : undefined,
              ...progressInfo,
            });
          } else if (chunk.type == "response.code_interpreter_call.in_progress") {
            if (lastStatus !== ResponseStatus.CODE_INTERPRETER) {
              lastStatus = ResponseStatus.CODE_INTERPRETER;
              stopped = await callbacks.onProgress("", {
                status: ResponseStatus.CODE_INTERPRETER,
                ...progressInfo,
              });
            }
          } else if (chunk.type == "response.code_interpreter_call_code.delta") {
            stopped = await callbacks.onProgress("", { status: ResponseStatus.CODE_INTERPRETER });
          } else if (chunk.type == "response.code_interpreter_call.interpreting") {
            stopped = await callbacks.onProgress(genProcessSymbol(), {
              status: ResponseStatus.CODE_INTERPRETER,
              ...progressInfo,
            });
          } else if (chunk.type == "response.code_interpreter_call_code.done") {
            logger.debug(chunk, "code interpreter call completed");
            stopped = await callbacks.onProgress("", {
              status: ResponseStatus.CODE_INTERPRETER,
              ...progressInfo,
              tools: [
                {
                  name: "code_interpreter",
                  content: chunk.code || "",
                  callId: chunk.item_id,
                },
              ],
            });
          } else if (chunk.type == "response.reasoning_summary_part.added") {
            partResponse = "";
          } else if (chunk.type == "response.reasoning_summary_text.delta") {
            partResponse += chunk.delta;
            stopped = await callbacks.onProgress("", {
              status: ResponseStatus.REASONING,
              ...progressInfo,
              detail: partResponse,
            });
          } else if (chunk.type == "response.reasoning_summary_text.done") {
            if (!meta.reasoning) {
              meta.reasoning = [];
            }

            const text = chunk.text || partResponse;
            if (text) {
              meta.reasoning.push({
                text,
                timestamp: new Date(),
                id: chunk.item_id,
              });
            }
          } else if (chunk.type == "response.output_item.added") {
            if (chunk.item.type === "reasoning") {
              if (lastStatus !== ResponseStatus.REASONING) {
                lastStatus = ResponseStatus.REASONING;
                stopped = await callbacks.onProgress("", {
                  status: ResponseStatus.REASONING,
                  ...progressInfo,
                });
              }
            }
          } else if (chunk.type == "response.output_item.done") {
            let status: ResponseStatus | undefined = undefined;
            const item = chunk.item;
            let detail: string | undefined = undefined;

            if (item.type === "web_search_call") {
              status = ResponseStatus.WEB_SEARCH;
              detail = (item as any)?.action?.query || "";
            } else if (item.type === "code_interpreter_call") {
              status = ResponseStatus.CODE_INTERPRETER;
            } else if (item.type === "function_call") {
              status = ResponseStatus.TOOL_CALL;
              if (callableTools.length) {
                pendingFunctionCalls.push({
                  name: (item as any).name as string,
                  callId: (item as any).call_id as string,
                  arguments: ((item as any).arguments as string) || "{}",
                });
              }
            } else if (item.type === "reasoning") {
              if (item.summary?.length || item.content?.length) {
                status = ResponseStatus.REASONING;
              } else {
                status = undefined;
              }
            } else if (item.type === "image_generation_call") {
              status = ResponseStatus.CONTENT_GENERATION;
              detail = (item as any)?.revised_prompt as string;
            }

            if (status) {
              lastStatus = status;
              stopped = await callbacks.onProgress("", {
                status,
                ...progressInfo,
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
            } else if (
              chunk.annotation.type === "file_citation" ||
              chunk.annotation.type === "file_path" ||
              chunk.annotation.type === "container_file_citation"
            ) {
              const annotation = chunk.annotation as OpenAI.Responses.ResponseOutputText.ContainerFileCitation;
              meta.annotations.push({
                type: "file",
                title: annotation.filename,
                source: annotation.file_id,
                container: annotation.container_id,
                startIndex: annotation.start_index,
                endIndex: annotation.end_index,
              });
            }
          } else if (chunk.type == "response.completed" || chunk.type == "response.incomplete") {
            lastResponseId = chunk.response.id;
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
          } else if (chunk.type == "response.image_generation_call.generating") {
            stopped = await callbacks.onProgress("", {
              status: ResponseStatus.CONTENT_GENERATION,
              ...progressInfo,
            });
          } else if (chunk.type == "response.image_generation_call.partial_image") {
            const imageUrl = IMAGE_BASE64_TPL("png", chunk.partial_image_b64);
            images[0] = imageUrl;
            stopped = await callbacks.onProgress(
              IMAGE_MARKDOWN_TPL(imageUrl),
              {
                status: ResponseStatus.CONTENT_GENERATION,
                ...progressInfo,
              },
              true
            );
          } else if (
            chunk.type == "response.image_generation_call.completed" ||
            chunk.type == "response.image_generation_call.in_progress"
          ) {
            // do nothing
          } else if (chunk.type == "response.function_call_arguments.delta") {
            stopped = await callbacks.onProgress("", {
              status: ResponseStatus.TOOL_CALL,
              ...progressInfo,
            });
          } else if (chunk.type == "response.function_call_arguments.done") {
            // arguments collected via response.output_item.done
          } else if (!["keepalive"].includes(chunk.type)) {
            logger.trace(chunk, `Unhandled response chunk type: ${chunk.type}`);
          }
        } // end for await

        if (stopped || !pendingFunctionCalls.length || !callableTools.length) break;

        const toolCalls: ChatCompletionToolCall[] = pendingFunctionCalls.map(fc => ({
          callId: fc.callId,
          type: "function" as const,
          name: fc.name,
          arguments: (() => {
            try {
              return JSON.parse(fc.arguments);
            } catch {
              return {};
            }
          })(),
        }));

        stopped = await callbacks.onProgress(genProcessSymbol(), {
          status: ResponseStatus.TOOL_CALL,
          toolCalls: toolCalls.map(c => ({ ...c, name: c.name || "unknown", args: JSON.stringify(c.arguments || {}) })),
        });
        if (stopped) break;

        const toolResults = await this.callCompletionTools(
          toolCalls,
          callableTools,
          callbacks.onProgress,
          inputRequest.mcpTokens
        );

        const completedTools: ChatToolCallResult[] = toolResults
          .map(({ call, result }) => ({
            name: call.name || "unknown",
            content: this.parseCompletionToolCallResult(result),
            callId: call.callId,
          }))
          .filter(notEmpty);

        await callbacks.onProgress("", {
          status: ResponseStatus.TOOL_CALL_COMPLETED,
          tools: completedTools,
          toolCalls: toolCalls.map(tc => ({
            name: tc.name || "unknown",
            type: tc.type,
            callId: tc.callId,
            args: tc.arguments ? JSON.stringify(tc.arguments) : undefined,
          })),
        });

        stopped = toolResults.some(tr => tr.stopped);
        if (stopped) break;

        let functionOutputs = toolResults.map(({ call, result }) => ({
          type: "function_call_output" as const,
          call_id: call.callId,
          output: this.parseCompletionToolCallResult(result),
        }));

        while (retry < RETRY_COUNT) {
          try {
            stream = await this.openai.responses.create({
              ...baseParams,
              previous_response_id: lastResponseId,
              input: functionOutputs,
            } as OpenAI.Responses.ResponseCreateParamsStreaming);

            break;
          } catch (error: unknown) {
            if (this.errorProcessor.isInputTooLargeError(error) && retry < RETRY_COUNT) {
              ++retry;
              await callbacks.onProgress("", {
                status: ResponseStatus.IN_PROGRESS,
                detail: `Compacting function call results, got error: ${(error as Error).message}`,
              });

              functionOutputs = functionOutputs
                .filter(msg => msg.output)
                .map(msg => ({
                  ...msg,
                  output: msg.output.substring((msg.output.length * 0.5) | 0),
                }));
              continue;
            }

            throw error;
          }
        }
      } while (cycleNo++ < cyclesLimit);
    } catch (err: unknown) {
      stopped = await callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      if (stopped) {
        stream?.controller?.abort();
      }
      return;
    }

    if (stopped) {
      stream?.controller?.abort();
    }

    await callbacks.onComplete({
      content: fullResponse || (stopped ? "_Cancelled_" : images.length ? "" : "_No response_"),
      images,
      metadata: meta,
      completed: true,
    });
  }

  private parseResponsesOutput(response: OpenAI.Responses.Response): {
    content: string;
    images: string[];
    metadata: MessageMetadata;
  } {
    const { output, usage } = response;

    let metadata: MessageMetadata = {
      usage: {
        inputTokens: usage?.input_tokens || 0,
        outputTokens: usage?.output_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
        cacheReadInputTokens: usage?.input_tokens_details?.cached_tokens || 0,
      },
    };

    const { content, images } = output.reduce(
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
                  } else if (ann.type === "container_file_citation") {
                    if (extendText && !processedSources.has(ann.filename)) {
                      processedSources.add(ann.filename);
                      text += `* ${ann.filename}\n`;
                    }

                    ok(metadata.annotations);
                    metadata.annotations.push({
                      type: "file",
                      title: ann.filename,
                      container: ann.container_id,
                      source: ann.file_id,
                      startIndex: ann.start_index,
                      endIndex: ann.end_index,
                    });
                  } else if (ann.type === "file_path") {
                    const key = "file_path" + ann.file_id;
                    if (extendText && !processedSources.has(key)) {
                      processedSources.add(key);
                      text += `* file path ${ann.file_id}\n`;
                    }

                    ok(metadata.annotations);
                    metadata.annotations.push({
                      type: "file_path",
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
            res.images.push(item.result);
          } else {
            res.content += `|Image ${item.id}: ${item.status}|\n\n`;
          }
        }
        return res;
      },
      { content: "", images: [] as string[] }
    );

    return { content, images, metadata };
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

  private getResponsesCallableTools(
    tools: OpenAI.Responses.Tool[] = [],
    mcpServers: IMCPServer[] = []
  ): ChatCompletionToolCallable[] {
    if (!tools.length && !mcpServers.length) return [];

    const functionTools = tools.filter(t => t.type === "function");
    const serverMap = new Map(mcpServers?.map(s => [`M_${s.id.replace(/-/g, "")}`, s]) || []);
    const mcpTools = functionTools.filter(t => t.name?.startsWith("M_"));

    const result: ChatCompletionToolCallable[] = [];
    if (mcpTools.length) {
      const localServers: { server: IMCPServer; tool: ChatTool }[] = [];
      mcpTools.forEach(tool => {
        const serverName = (tool.name || "")?.replace(/_\d+$/, "");
        const server = serverMap.get(serverName);
        if (!server) return;
        localServers.push({
          server,
          tool: {
            type: ToolType.MCP,
            name: server.name,
            id: server.id,
          },
        });
      });

      result.push(
        ...formatOpenAIMcpTools(
          localServers.map(s => s.tool),
          localServers.map(s => s.server)
        )
      );
    }

    return result;
  }
}

function genProcessSymbol(): string {
  const symbols = ["📲", "🖥️", "💻", "💡", "🤖", "🟢", "🧠", "🦾"];
  return symbols[Math.floor(Math.random() * symbols.length)];
}
