import { useCallback, useMemo } from "react";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { MessageRole, useRealtimeVoice, RealtimeSessionInfo, RealtimeToolCall, RealtimeTranscript } from "@katechat/ui";

import { ADD_CHAT_MESSAGE, CALL_REALTIME_TOOL, CREATE_REALTIME_SESSION } from "@/store/services/graphql.queries";
import { AddChatMessageResponse, CreateRealtimeSessionResponse, Message } from "@/types/graphql";
import { APP_WS_URL } from "@/lib/config";
import { McpTokenInfo } from "@/components/auth/McpAuthentication";

interface UseRealtimeChatProps {
  chatId?: string;
  /** tokens for the chat's MCP servers: their tools run on the API, which has none of them */
  mcpTokens?: McpTokenInfo[];
  onMessageSaved?: (message: Message) => void;
}

/** Sent first over the WebSocket proxy (see REALTIME_MCP_TOKENS_EVENT in the API's realtime service) */
const MCP_TOKENS_EVENT = "katechat.mcp_tokens";

/**
 * Voice-to-voice session for REALTIME models: mints connection info via the
 * API (ephemeral token → WebRTC, or WebSocket proxy) and persists both sides
 * of the conversation transcript into the regular chat history.
 */
export const useRealtimeChat = ({ chatId, mcpTokens, onMessageSaved }: UseRealtimeChatProps) => {
  const { t } = useTranslation();

  const [createRealtimeSession] = useMutation<CreateRealtimeSessionResponse>(CREATE_REALTIME_SESSION);
  const [callRealtimeTool] = useMutation<{ callRealtimeTool: string }>(CALL_REALTIME_TOOL);
  const [addChatMessage] = useMutation<AddChatMessageResponse>(ADD_CHAT_MESSAGE, {
    onCompleted: data => {
      if (data.addChatMessage) {
        onMessageSaved?.(data.addChatMessage);
      }
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("chat.failedToSend"),
        color: "red",
      });
    },
  });

  const getSession = useCallback(async (): Promise<RealtimeSessionInfo> => {
    if (!chatId) throw new Error("Chat is required for a voice session");

    const { data } = await createRealtimeSession({ variables: { chatId, mcpTokens } });
    const session = data?.createRealtimeSession;
    if (!session) throw new Error("Failed to create realtime session");

    if (session.transport === "websocket" && session.wsUrl) {
      // the API returns a relative proxy path — resolve against the API host
      const base = APP_WS_URL.replace(/^http/, "ws");
      return { ...session, wsUrl: session.wsUrl.startsWith("ws") ? session.wsUrl : `${base}${session.wsUrl}` };
    }

    return session as RealtimeSessionInfo;
  }, [chatId, mcpTokens, createRealtimeSession]);

  // WebRTC: the model's function calls run on the API (MCP tokens, search keys, documents)
  const handleToolCall = useCallback(
    async (call: RealtimeToolCall): Promise<string> => {
      if (!chatId) throw new Error("Chat is required for a voice session");
      const { data } = await callRealtimeTool({
        variables: { chatId, callId: call.callId, name: call.name, arguments: call.arguments, mcpTokens },
      });
      return data?.callRealtimeTool ?? "";
    },
    [chatId, mcpTokens, callRealtimeTool]
  );

  const initialEvents = useMemo(
    () => (mcpTokens?.length ? [{ type: MCP_TOKENS_EVENT, tokens: mcpTokens }] : undefined),
    [mcpTokens]
  );

  const handleTranscript = useCallback(
    (transcript: RealtimeTranscript) => {
      if (!chatId || !transcript.text?.trim()) return;

      addChatMessage({
        variables: {
          input: {
            chatId,
            content: transcript.text.trim(),
            role: transcript.role === "user" ? MessageRole.USER : MessageRole.ASSISTANT,
          },
        },
      });
    },
    [chatId, addChatMessage]
  );

  const handleError = useCallback(
    (message: string) => {
      notifications.show({
        title: t("chat.voiceSessionError"),
        message,
        color: "red",
      });
    },
    [t]
  );

  const { status, error, connect, disconnect, inputAnalyser, outputAnalyser } = useRealtimeVoice({
    getSession,
    onTranscript: handleTranscript,
    onError: handleError,
    onToolCall: handleToolCall,
    initialEvents,
  });

  return {
    voiceStatus: status,
    voiceError: error,
    startVoiceCall: connect,
    stopVoiceCall: disconnect,
    inputAnalyser,
    outputAnalyser,
  };
};
