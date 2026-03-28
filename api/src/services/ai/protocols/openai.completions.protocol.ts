import OpenAI from "openai";
import { Stream } from "openai/core/streaming";
import {
  ModelMessage,
  ModelResponse,
  StreamCallbacks,
  CompleteChatRequest,
  MessageMetadata,
  ChatTool,
  IMCPServer,
  ModelMessageContent,
  ChatToolCallResult,
} from "@/types/ai.types";
import { MessageRole, ResponseStatus, ToolType } from "@/types/api";
import { createLogger } from "@/utils/logger";
import { notEmpty } from "@/utils/assert";
import {
  ChatCompletionToolCall,
  ChatCompletionToolCallable,
  formatOpenAIMcpTools,
  CustomWebSearchTool,
} from "./openai.tools";
import { OpenAIProtocolBase, OpenAIProtocolOptions, RETRY_COUNT } from "./openai.protocol";
import { OPENAI_MODELS_SUPPORT_IMAGES_INPUT } from "@/config/ai/openai";

const logger = createLogger(__filename);

type CompletionModelMessage = ModelMessage & {
  toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  toolResult?: OpenAI.Chat.Completions.ChatCompletionMessageParam;
};

export class OpenAICompletionsProtocol extends OpenAIProtocolBase {
  constructor(options: OpenAIProtocolOptions) {
    super(options);
  }

  get type(): "completions" {
    return "completions";
  }

  async completeChat(input: CompleteChatRequest, messages: ModelMessage[] = []): Promise<ModelResponse> {
    try {
      const contextMessages = messages.map(m => m.id).filter(notEmpty);
      const params = await this.formatCompletionRequest(input, messages);
      logger.debug({ ...params, messages: [] }, "invoking chat.completions...");

      const completion = await this.openai.chat.completions.create(params);
      logger.debug(completion, "chat.completions response");

      const usage = completion.usage;
      return {
        content: completion.choices[0]?.message?.content || "",
        metadata: {
          contextMessages,
          usage: {
            inputTokens: usage?.prompt_tokens || 0,
            outputTokens: usage?.completion_tokens || 0,
            cacheReadInputTokens: usage?.prompt_tokens_details?.cached_tokens || 0,
          },
        },
      };
    } catch (error: unknown) {
      logger.error(error, "Error calling OpenAI chat.completions API");
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
      await this.streamChatCompletionLegacy(inputRequest, messages, callbacks);
    } catch (error) {
      logger.warn(error, "Streaming error");
      if (error instanceof OpenAI.APIError) {
        await callbacks.onError(new Error(`OpenAI API error: ${error.message}`));
      } else {
        await callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  async stopRequest(_requestId: string): Promise<void> {
    throw new Error(`Request cancellation is not supported for OpenAI models using Completions API`);
  }

  private async formatCompletionMessages(
    modelId: string,
    messages: CompletionModelMessage[],
    systemPrompt: string | undefined
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
    type ChatCompletionMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
    type ChatCompletionContentPartText = OpenAI.Chat.Completions.ChatCompletionContentPartText;
    type ChatCompletionContentPart = OpenAI.Chat.Completions.ChatCompletionContentPart;
    const imageInput = !!OPENAI_MODELS_SUPPORT_IMAGES_INPUT.find(prefix => modelId.startsWith(prefix));

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

        if (addImages && part.contentType === "image" && imageInput) {
          if (!this.fileLoader) {
            logger.warn(`File loader is not connected, cannot load image content: ${part.fileName}`);
            continue;
          }

          const fileContent = await this.fileLoader.getFileContentBase64(part.fileName);
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

      return parts.length ? parts : "";
    };

    const requestMessages: ChatCompletionMessageParam[] = [];

    for (const msg of messages) {
      const role = this.mapMessageRole(msg.role);
      if (msg.toolCalls) {
        requestMessages.push({
          role: "assistant",
          tool_calls: msg.toolCalls,
        });
        continue;
      }

      if (msg.toolResult) {
        requestMessages.push(msg.toolResult);
        continue;
      }

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

      const content = await parseContent(msg.body);
      if (content) {
        requestMessages.push(...toolCalls, ...tools, {
          role,
          content,
        } as ChatCompletionMessageParam);
      }
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

  private async formatCompletionRequest(
    inputRequest: CompleteChatRequest,
    messages: CompletionModelMessage[] = []
  ): Promise<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming> {
    const { settings = {}, modelId: requestModelId, tools, mcpServers } = inputRequest;
    const { systemPrompt, temperature, maxTokens } = settings;

    const modelId = this.modelIdOverride || requestModelId;

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: modelId,
      messages: await this.formatCompletionMessages(modelId, messages, systemPrompt),
      temperature,
      max_completion_tokens: maxTokens,
    };

    if (modelId.startsWith("o1") || modelId.startsWith("o4")) {
      delete params.temperature;
    } else if (modelId.startsWith("gpt-4o")) {
      delete params.temperature;
    } else if (modelId.startsWith("gpt-5")) {
      params.temperature = 1;
    }

    const requestTools = this.formatCompletionRequestTools(tools, mcpServers);
    if (requestTools.length) {
      params.tools = requestTools;
    }

    return this.paramsProcessor ? this.paramsProcessor.completionRequest(inputRequest, params) : params;
  }

  private formatCompletionRequestTools(
    inputTools?: ChatTool[],
    mcpServers?: IMCPServer[]
  ): ChatCompletionToolCallable[] {
    if (inputTools?.length) {
      const tools: ChatCompletionToolCallable[] = [];

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

  private async streamChatCompletionLegacy(
    input: CompleteChatRequest,
    messages: ModelMessage[] = [],
    callbacks: StreamCallbacks
  ): Promise<void> {
    let fullResponse = "";
    let meta: MessageMetadata | undefined = {
      contextMessages: messages.map(m => m.id).filter(notEmpty),
    };

    let stopped = await callbacks.onStart();
    if (stopped) {
      return await callbacks.onComplete({
        content: fullResponse,
        metadata: meta,
      });
    }

    const callableTools = this.formatCompletionRequestTools(input.tools, input.mcpServers);
    const cyclesLimit = 100;
    let cycleNo = 0;
    let stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk> | undefined = undefined;
    let sessionMessages: CompletionModelMessage[] = [...messages];

    do {
      try {
        const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
          ...(await this.formatCompletionRequest(input, sessionMessages)),
          stream: true,
          stream_options: { include_usage: true },
        };

        logger.debug(
          { ...params, messages: params.messages.map(m => m.role), tools: undefined },
          "invoking streaming chat.completions..."
        );
        stream = await this.openai.chat.completions.create(params);
        let streamedToolCalls: Array<OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall> = [];

        for await (const chunk of stream) {
          if (stopped) {
            stream?.controller?.abort();
            break;
          }

          logger.trace(chunk, "got chunk");
          const choice = chunk.choices?.[0];

          if (
            choice?.finish_reason === "tool_calls" &&
            (streamedToolCalls.length || choice?.delta?.tool_calls?.length)
          ) {
            const requestedToolCalls = (streamedToolCalls.length ? streamedToolCalls : choice.delta.tool_calls) || [];
            logger.debug({ tool_calls: requestedToolCalls }, "Tool calls requested");

            stopped = await this.processCompletionToolCall(
              requestedToolCalls,
              callableTools,
              callbacks,
              input.mcpTokens,
              sessionMessages
            );
            break;
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
              ...meta,
              usage: {
                inputTokens: usage.prompt_tokens || 0,
                outputTokens: usage.completion_tokens || 0,
                cacheReadInputTokens: usage.prompt_tokens_details?.cached_tokens || 0,
              },
            };
          }

          if (!stopped && choice?.finish_reason) {
            stopped = true;

            if (!fullResponse && choice.finish_reason !== "stop") {
              fullResponse = `Response finished with reason: ${choice.finish_reason}`;
            }
          }
        }
      } catch (error: unknown) {
        if (this.errorProcessor.isInputTooLargeError(error) && cycleNo < cyclesLimit) {
          if (sessionMessages.length > 1) {
            stopped = await callbacks.onProgress("", {
              status: ResponseStatus.IN_PROGRESS,
              detail: `Compacting conversation history`,
            });

            sessionMessages = sessionMessages.slice(-Math.floor(sessionMessages.length / 2));
            meta!.contextMessages = sessionMessages.map(m => m.id).filter(notEmpty);
            continue;
          }
        }

        throw error;
      }
    } while (!stopped && cycleNo++ < cyclesLimit);

    await callbacks.onComplete({
      content: fullResponse,
      metadata: meta,
      completed: true,
    });
  }

  private async processCompletionToolCall(
    requestedToolCalls: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[],
    callableTools: ChatCompletionToolCallable[],
    callbacks: StreamCallbacks,
    mcpTokens: import("@/types/ai.types").MCPAuthToken[] | undefined,
    sessionMessages: CompletionModelMessage[]
  ): Promise<boolean> {
    const toolCalls: ChatCompletionToolCall[] = requestedToolCalls.map(call =>
      this.parseCompletionToolCall(call, callableTools)
    );
    const failedCall = toolCalls.find(call => call.error);

    if (failedCall) {
      await callbacks.onError(new Error(failedCall.error));
      return true;
    }

    const metaCalls = toolCalls.map(c => ({
      ...c,
      name: c.name || "unknown",
      args: JSON.stringify(c.arguments || {}),
    }));
    let stopped = await callbacks.onProgress(genProcessSymbol(), {
      status: ResponseStatus.TOOL_CALL,
      toolCalls: metaCalls,
    });

    if (stopped) {
      return stopped;
    }

    const toolResults = await this.callCompletionTools(toolCalls, callableTools, callbacks.onProgress, mcpTokens);

    sessionMessages.push({
      role: MessageRole.ASSISTANT,
      body: [],
      toolCalls: requestedToolCalls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
    });
    sessionMessages.push(
      ...toolResults.map(tr => ({
        role: MessageRole.ASSISTANT,
        body: [],
        toolResult: tr.result,
      }))
    );

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

    await callbacks.onProgress("", {
      status: ResponseStatus.TOOL_CALL_COMPLETED,
      tools,
      toolCalls: toolCalls.map(tc => ({
        name: tc.name || "unknown",
        type: tc.type,
        callId: tc.callId,
        args: tc.arguments ? JSON.stringify(tc.arguments) : undefined,
      })),
    });

    return toolResults.some(tr => tr.stopped);
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
}

function genProcessSymbol(): string {
  const symbols = ["📲", "🖥️", "💻", "💡", "🤖", "🟢", "🧠", "🦾"];
  return symbols[Math.floor(Math.random() * symbols.length)];
}
