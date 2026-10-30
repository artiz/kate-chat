import { IncomingMessage } from "http";
import WebSocket from "ws";
import { In, Repository } from "typeorm";
import { fetch } from "undici";

import { Chat, ChatDocument, Model, User } from "@/entities";
import { ApiProvider, DocumentStatus, ModelType, ToolType } from "@/types/api";
import { MCPAuthToken } from "@/types/ai.types";
import { getRepository } from "@/config/database";
import { globalConfig } from "@/global-config";
import { ConnectionParams, loadConnectionParams } from "@/middleware/auth.middleware";
import { generateRealtimeToken, verifyRealtimeToken } from "@/utils/jwt";
import { getErrorMessage } from "@/utils/errors";
import { createLogger } from "@/utils/logger";
import {
  OPENAI_REALTIME_DEFAULT_VOICE,
  OPENAI_REALTIME_TRANSCRIPTION_MODEL,
  OPENAI_REALTIME_VOICES,
} from "@/config/ai/openai";
import { YANDEX_REALTIME_DEFAULT_VOICE, YANDEX_REALTIME_VOICES } from "@/config/ai/yandex";
import { buildRealtimeTools, RealtimeToolSet } from "@/services/ai/tools/realtime.tools";
import { EmbeddingsService } from "@/services/ai/embeddings.service";
import { McpServersService } from "@/services/mcp.service";

const logger = createLogger(__filename);

export const REALTIME_PROXY_PATH = "/realtime/proxy";

/**
 * Sent by the browser over the WebSocket proxy, before anything else: the MCP tokens it keeps for the
 * chat's servers (they never travel in the proxy URL, which logs keep). The proxy keeps it to itself.
 */
export const REALTIME_MCP_TOKENS_EVENT = "katechat.mcp_tokens";

/** A function call in a finished realtime response (response.done → response.output) */
interface RealtimeFunctionCall {
  type?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
}

/** The function calls a response.done event of a realtime session asks for, if any */
export function functionCallsOf(event: unknown): { call_id: string; name: string; arguments: string }[] {
  const { type, response } = (event || {}) as { type?: string; response?: { output?: RealtimeFunctionCall[] } };
  if (type !== "response.done" || !Array.isArray(response?.output)) return [];
  return response.output
    .filter(item => item?.type === "function_call" && item.call_id && item.name)
    .map(item => ({ call_id: item.call_id!, name: item.name!, arguments: item.arguments || "" }));
}

export interface RealtimeSessionInfo {
  transport: "webrtc" | "websocket";
  model: string;
  clientSecret?: string;
  sdpUrl?: string;
  wsUrl?: string;
}

interface RealtimeChatContext {
  chat: Chat;
  model: Model;
  user: User;
  connection: ConnectionParams;
  voice: string;
}

export class RealtimeService {
  private chatRepository: Repository<Chat>;
  private modelRepository: Repository<Model>;
  private userRepository: Repository<User>;
  private chatDocumentRepository: Repository<ChatDocument>;
  private mcpService: McpServersService;
  private embeddingsService: EmbeddingsService;

  constructor() {
    this.chatRepository = getRepository(Chat);
    this.modelRepository = getRepository(Model);
    this.userRepository = getRepository(User);
    this.chatDocumentRepository = getRepository(ChatDocument);
    this.mcpService = new McpServersService();
    this.embeddingsService = new EmbeddingsService();
  }

  private async loadChatContext(
    chatId: string,
    user: User,
    connection: ConnectionParams
  ): Promise<RealtimeChatContext> {
    const chat = await this.chatRepository.findOne({ where: { id: chatId }, relations: { user: true } });
    if (!chat) throw new Error("Chat not found");
    if (chat.user && chat.user.id !== user.id) throw new Error("Unauthorized access to this chat");

    const modelId = chat.modelId || user.settings?.defaultModelId;
    if (!modelId) throw new Error("Model must be defined for the chat or user");

    const model = await this.modelRepository.findOne({ where: { modelId, user: { id: user.id } } });
    if (!model) throw new Error("Model not found");
    if (model.type !== ModelType.REALTIME) throw new Error("Selected model does not support realtime voice sessions");

    // Yandex speech-realtime uses SpeechKit voices, OpenAI uses its own set.
    // The chat may keep a voice picked for another provider (e.g. "sage"
    // after chatting with GPT Realtime) — fall back to the provider default
    // instead of sending a voice the provider rejects.
    const [voices, defaultVoice] =
      model.apiProvider === ApiProvider.YANDEX_AI
        ? [YANDEX_REALTIME_VOICES, YANDEX_REALTIME_DEFAULT_VOICE]
        : [OPENAI_REALTIME_VOICES, OPENAI_REALTIME_DEFAULT_VOICE];
    const chatVoice = chat.settings?.voice;

    return {
      chat,
      model,
      user,
      connection,
      voice: chatVoice && voices.includes(chatVoice) ? chatVoice : defaultVoice,
    };
  }

  /**
   * The chat's MCP servers, web search and RAG documents as the session's function tools (see
   * buildRealtimeTools). Built again for every call, so a call runs with the tokens the browser has now.
   */
  private async loadTools(ctx: RealtimeChatContext, mcpTokens?: MCPAuthToken[]): Promise<RealtimeToolSet> {
    const { chat, model, user, connection } = ctx;
    const chatTools = chat.tools || [];

    const mcpIds = chatTools.filter(tool => tool.type === ToolType.MCP && tool.id).map(tool => tool.id as string);
    const mcpServers = mcpIds.length ? await this.mcpService.findByIds(mcpIds, user.id) : [];
    for (const server of mcpServers) {
      if (server.tools?.length) continue;
      const token = mcpTokens?.find(t => t.serverId === server.id)?.accessToken;
      await this.mcpService
        .fetchAndStoreTools(server, token)
        .catch(error => logger.warn({ error, server: server.name }, "Cannot load the MCP server's tools"));
    }

    const selected = chat.settings?.selectedRagDocIds || [];
    const documents = selected.length
      ? (
          await this.chatDocumentRepository.find({
            where: { chatId: chat.id, documentId: In(selected) },
            relations: { document: true },
          })
        )
          .filter(link => link.document?.status === DocumentStatus.READY)
          .map(link => ({ id: link.document.id, name: link.document.fileName }))
      : [];

    return buildRealtimeTools({
      chatTools,
      apiProvider: model.apiProvider,
      modelId: model.modelId,
      connection,
      mcpServers,
      mcpTokens,
      mcpToolApprovals: user.settings?.mcpToolApprovals,
      documents,
      findChunks: (documentIds, query) =>
        this.embeddingsService.findChunks(documentIds, query, connection, {
          limit: globalConfig.ai.ragQueryChunksLimit,
          loadFullPage: false,
        }),
    });
  }

  /** Runs a function call the model made in a WebRTC session, which the browser hands over */
  public async callTool(
    chatId: string,
    user: User,
    connection: ConnectionParams,
    call: { callId: string; name: string; arguments: string },
    mcpTokens?: MCPAuthToken[]
  ): Promise<string> {
    const ctx = await this.loadChatContext(chatId, user, connection);
    const tools = await this.loadTools(ctx, mcpTokens);
    logger.debug({ chatId, tool: call.name }, "Realtime tool call");
    return tools.call(call.name, call.arguments, call.callId);
  }

  /**
   * Mint connection info for a realtime voice session. OpenAI: an ephemeral
   * client secret so the browser talks WebRTC to the provider directly;
   * providers without ephemeral tokens fall back to our WebSocket proxy.
   */
  public async createSession(
    chatId: string,
    user: User,
    connection: ConnectionParams,
    mcpTokens?: MCPAuthToken[]
  ): Promise<RealtimeSessionInfo> {
    const ctx = await this.loadChatContext(chatId, user, connection);
    const { model } = ctx;

    if (model.apiProvider === ApiProvider.OPEN_AI) {
      try {
        return await this.createOpenAIEphemeralSession(ctx, await this.loadTools(ctx, mcpTokens));
      } catch (err) {
        logger.warn(
          { err, modelId: model.modelId },
          "Ephemeral realtime session is not available, falling back to WebSocket proxy"
        );
      }
    }

    // WebSocket proxy fallback (Yandex speech-realtime and others)
    const token = generateRealtimeToken({ userId: user.id, chatId });
    return {
      transport: "websocket",
      model: model.modelId,
      wsUrl: `${REALTIME_PROXY_PATH}?token=${encodeURIComponent(token)}`,
    };
  }

  private async createOpenAIEphemeralSession(
    ctx: RealtimeChatContext,
    tools: RealtimeToolSet
  ): Promise<RealtimeSessionInfo> {
    const { chat, model, connection, voice } = ctx;
    const apiKey = connection.openAiApiKey;
    if (!apiKey) throw new Error("OpenAI API key is not configured");

    // GA Realtime API: mint an ephemeral client secret with the session
    // config baked in; the browser exchanges SDP at /realtime/calls
    const baseUrl = globalConfig.openai.apiUrl || "https://api.openai.com/v1";
    const response = await fetch(`${baseUrl}/realtime/client_secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: model.modelId,
          audio: {
            input: { transcription: { model: OPENAI_REALTIME_TRANSCRIPTION_MODEL } },
            output: { voice },
          },
          ...(chat.settings?.systemPrompt ? { instructions: chat.settings.systemPrompt } : {}),
          // the browser runs the calls through callRealtimeTool (the client's useRealtimeChat)
          ...(tools.tools.length ? { tools: tools.tools, tool_choice: "auto" } : {}),
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create realtime session: ${response.status} ${errorText}`);
    }

    const session = (await response.json()) as { value?: string; client_secret?: { value?: string } };
    // GA returns the secret as top-level `value`; older responses nested it
    const clientSecret = session.value || session.client_secret?.value;
    if (!clientSecret) throw new Error("No client secret in realtime session response");

    return {
      transport: "webrtc",
      model: model.modelId,
      clientSecret,
      sdpUrl: `${baseUrl}/realtime/calls?model=${encodeURIComponent(model.modelId)}`,
    };
  }

  /**
   * WebSocket proxy: browser <-> our server <-> provider realtime API.
   * Used when the provider has no ephemeral tokens (server-side API key
   * must not reach the browser).
   */
  public async handleProxyConnection(client: WebSocket, request: IncomingMessage): Promise<void> {
    let upstream: WebSocket | undefined;

    const close = (code = 1000, reason = "") => {
      try {
        client.close(code, reason);
      } catch {
        /* already closed */
      }
      try {
        upstream?.close();
      } catch {
        /* already closed */
      }
    };

    try {
      const url = new URL(request.url || "", "http://localhost");
      const token = url.searchParams.get("token") || "";
      const { userId, chatId } = verifyRealtimeToken(token);

      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) throw new Error("User not found");

      // headers -> environment -> user settings, same as GraphQL resolvers
      const connection = loadConnectionParams({});
      if (user.settings) {
        connection.openAiApiKey ||= user.settings.openaiApiKey;
        connection.yandexFmApiKey ||= user.settings.yandexFmApiKey;
        connection.yandexFmApiFolder ||= user.settings.yandexFmApiFolderId;
      }

      const ctx = await this.loadChatContext(chatId, user, connection);
      const { upstreamUrl, headers } = this.getUpstreamTarget(ctx);
      // tokens of the chat's MCP servers, from the browser's first event (REALTIME_MCP_TOKENS_EVENT)
      let mcpTokens: MCPAuthToken[] | undefined;

      logger.debug(
        {
          chatId,
          modelId: ctx.model.modelId,
          upstreamUrl,
          authScheme: headers.Authorization?.split(" ")[0],
        },
        "Opening realtime proxy connection"
      );
      upstream = new WebSocket(upstreamUrl, { headers });

      // client events are buffered until the provider session is configured —
      // the session config is applied after the provider reports
      // session.created (events sent earlier may be ignored)
      let sessionConfigured = false;
      const pendingClientMessages: string[] = [];

      const configureSession = async () => {
        if (sessionConfigured || !upstream || upstream.readyState !== WebSocket.OPEN) return;
        sessionConfigured = true;
        const tools = await this.loadTools(ctx, mcpTokens).catch(error => {
          logger.warn(error, "Cannot load the realtime session's tools");
          return undefined;
        });
        if (upstream.readyState !== WebSocket.OPEN) return;

        // GA Realtime API shape: voice/formats/VAD under session.audio
        // (matches the Yandex voice-agent demo session.update)
        const audio: Record<string, unknown> = {
          input: {
            format: { type: "audio/pcm", rate: 24000 },
            turn_detection: { type: "server_vad", silence_duration_ms: 800, threshold: 0.5 },
          },
          output: {
            voice: ctx.voice,
            format: { type: "audio/pcm", rate: 24000 },
            speed: 1,
          },
        };
        const session: Record<string, unknown> = {
          type: "realtime",
          // a single modality: Yandex rejects ["audio", "text"] ("Modalities
          // can be either audio or text"); with "audio" the effective session
          // still reports text+audio and transcripts keep flowing
          output_modalities: ["audio"],
          audio,
        };
        if (ctx.chat.settings?.systemPrompt) {
          session.instructions = ctx.chat.settings.systemPrompt;
        }
        if (tools?.tools.length) {
          // the calls run here, in handleFunctionCalls, not in the browser
          session.tools = tools.tools;
          session.tool_choice = "auto";
        }
        if (ctx.model.apiProvider === ApiProvider.OPEN_AI) {
          // whisper transcription model is OpenAI-specific; other providers
          // transcribe input with their own defaults
          (audio.input as Record<string, unknown>).transcription = { model: OPENAI_REALTIME_TRANSCRIPTION_MODEL };
        }
        upstream.send(JSON.stringify({ type: "session.update", session }));
        pendingClientMessages.splice(0).forEach(text => upstream?.send(text));
      };

      client.on("message", data => {
        // realtime events are JSON text; the ws library delivers browser text
        // frames as Buffers and would relay them as BINARY frames, which
        // providers silently drop — always forward as text
        const text = data.toString();
        if (text.includes(REALTIME_MCP_TOKENS_EVENT)) {
          try {
            const event = JSON.parse(text) as { type?: string; tokens?: MCPAuthToken[] };
            if (event.type === REALTIME_MCP_TOKENS_EVENT) {
              mcpTokens = Array.isArray(event.tokens) ? event.tokens : undefined;
              return;
            }
          } catch {
            /* not ours: forward it */
          }
        }
        if (sessionConfigured && upstream && upstream.readyState === WebSocket.OPEN) {
          upstream.send(text);
        } else {
          pendingClientMessages.push(text);
        }
      });

      upstream.on("open", () => {
        // fallback for providers that do not emit session.created
        setTimeout(() => void configureSession(), 3000);
      });

      upstream.on("message", data => {
        const text = data.toString();

        if (logger.isLevelEnabled("debug")) {
          try {
            const event = JSON.parse(text) as { type?: string; error?: unknown };
            logger.debug({ type: event.type, error: event.error }, "Realtime proxy upstream event");
          } catch {
            logger.debug("Realtime proxy upstream event: non-JSON payload");
          }
        }

        if (!sessionConfigured && text.includes("session.created")) {
          void configureSession();
        }

        if (text.includes("function_call") && upstream) {
          void this.handleFunctionCalls(text, upstream, () => this.loadTools(ctx, mcpTokens));
        }

        if (client.readyState === WebSocket.OPEN) {
          client.send(text);
        }
      });

      upstream.on("close", () => close());
      upstream.on("error", err => {
        logger.warn(err, "Realtime proxy upstream error");
        close(1011, "Upstream connection error");
      });
      client.on("close", () => close());
      client.on("error", () => close());
    } catch (err) {
      logger.warn(err, "Realtime proxy connection rejected");
      try {
        client.send(JSON.stringify({ type: "error", error: { message: getErrorMessage(err) } }));
      } catch {
        /* client already gone */
      }
      close(1008, "Unauthorized or invalid session");
    }
  }

  /**
   * Runs the function calls of a finished response on the API and answers the provider: one output
   * item per call, then a new response, so the model speaks with the results.
   */
  private async handleFunctionCalls(
    text: string,
    upstream: WebSocket,
    loadTools: () => Promise<RealtimeToolSet>
  ): Promise<void> {
    let event: unknown;
    try {
      event = JSON.parse(text);
    } catch {
      return;
    }
    const calls = functionCallsOf(event);
    if (!calls.length) return;

    const tools = await loadTools();
    const outputs = await Promise.all(
      calls.map(async call => ({ call, output: await tools.call(call.name, call.arguments, call.call_id) }))
    );
    if (upstream.readyState !== WebSocket.OPEN) return;
    for (const { call, output } of outputs) {
      upstream.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: call.call_id, output },
        })
      );
    }
    upstream.send(JSON.stringify({ type: "response.create" }));
  }

  private getUpstreamTarget(ctx: RealtimeChatContext): { upstreamUrl: string; headers: Record<string, string> } {
    const { model, connection } = ctx;

    if (model.apiProvider === ApiProvider.YANDEX_AI) {
      const apiKey = connection.yandexFmApiKey;
      const folder = connection.yandexFmApiFolder;
      if (!apiKey || !folder) throw new Error("Yandex API key/folder is not configured");

      const modelUri = model.modelId.replace("{folder}", folder);
      // IAM tokens (t1....) go as Bearer, plain API keys need the Api-Key
      // scheme (the realtime gateway rejects API keys sent as Bearer);
      // the folder is passed via the OpenAI-Project header
      return {
        upstreamUrl: `${globalConfig.yandex.realtimeApiUrl}?model=${encodeURIComponent(modelUri)}`,
        headers: {
          Authorization: apiKey.startsWith("t1.") ? `Bearer ${apiKey}` : `Api-Key ${apiKey}`,
          "OpenAI-Project": folder,
          "x-folder-id": folder,
        },
      };
    }

    // OpenAI-compatible fallback proxy (GA API — no beta header)
    const apiKey = connection.openAiApiKey;
    if (!apiKey) throw new Error("OpenAI API key is not configured");
    const baseUrl = (globalConfig.openai.apiUrl || "https://api.openai.com/v1").replace(/^http/, "ws");
    return {
      upstreamUrl: `${baseUrl}/realtime?model=${encodeURIComponent(model.modelId)}`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    };
  }
}
