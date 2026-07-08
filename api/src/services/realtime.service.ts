import { IncomingMessage } from "http";
import WebSocket from "ws";
import { Repository } from "typeorm";
import { fetch } from "undici";

import { Chat, Model, User } from "@/entities";
import { ApiProvider, ModelType } from "@/types/api";
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

const logger = createLogger(__filename);

export const REALTIME_PROXY_PATH = "/realtime/proxy";

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
  connection: ConnectionParams;
  voice: string;
}

export class RealtimeService {
  private chatRepository: Repository<Chat>;
  private modelRepository: Repository<Model>;
  private userRepository: Repository<User>;

  constructor() {
    this.chatRepository = getRepository(Chat);
    this.modelRepository = getRepository(Model);
    this.userRepository = getRepository(User);
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
      connection,
      voice: chatVoice && voices.includes(chatVoice) ? chatVoice : defaultVoice,
    };
  }

  /**
   * Mint connection info for a realtime voice session. OpenAI: an ephemeral
   * client secret so the browser talks WebRTC to the provider directly;
   * providers without ephemeral tokens fall back to our WebSocket proxy.
   */
  public async createSession(chatId: string, user: User, connection: ConnectionParams): Promise<RealtimeSessionInfo> {
    const ctx = await this.loadChatContext(chatId, user, connection);
    const { model } = ctx;

    if (model.apiProvider === ApiProvider.OPEN_AI) {
      try {
        return await this.createOpenAIEphemeralSession(ctx);
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

  private async createOpenAIEphemeralSession(ctx: RealtimeChatContext): Promise<RealtimeSessionInfo> {
    const { model, connection, voice } = ctx;
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

      const configureSession = () => {
        if (sessionConfigured || !upstream || upstream.readyState !== WebSocket.OPEN) return;
        sessionConfigured = true;

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
        if (sessionConfigured && upstream && upstream.readyState === WebSocket.OPEN) {
          upstream.send(text);
        } else {
          pendingClientMessages.push(text);
        }
      });

      upstream.on("open", () => {
        // fallback for providers that do not emit session.created
        setTimeout(configureSession, 3000);
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
          configureSession();
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
