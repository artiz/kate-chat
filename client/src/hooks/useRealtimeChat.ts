import { useCallback } from "react";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { MessageRole, useRealtimeVoice, RealtimeSessionInfo, RealtimeTranscript } from "@katechat/ui";

import { ADD_CHAT_MESSAGE, CREATE_REALTIME_SESSION } from "@/store/services/graphql.queries";
import { AddChatMessageResponse, CreateRealtimeSessionResponse, Message } from "@/types/graphql";
import { APP_WS_URL } from "@/lib/config";

interface UseRealtimeChatProps {
  chatId?: string;
  onMessageSaved?: (message: Message) => void;
}

/**
 * Voice-to-voice session for REALTIME models: mints connection info via the
 * API (ephemeral token → WebRTC, or WebSocket proxy) and persists both sides
 * of the conversation transcript into the regular chat history.
 */
export const useRealtimeChat = ({ chatId, onMessageSaved }: UseRealtimeChatProps) => {
  const { t } = useTranslation();

  const [createRealtimeSession] = useMutation<CreateRealtimeSessionResponse>(CREATE_REALTIME_SESSION);
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

    const { data } = await createRealtimeSession({ variables: { chatId } });
    const session = data?.createRealtimeSession;
    if (!session) throw new Error("Failed to create realtime session");

    if (session.transport === "websocket" && session.wsUrl) {
      // the API returns a relative proxy path — resolve against the API host
      const base = APP_WS_URL.replace(/^http/, "ws");
      return { ...session, wsUrl: session.wsUrl.startsWith("ws") ? session.wsUrl : `${base}${session.wsUrl}` };
    }

    return session as RealtimeSessionInfo;
  }, [chatId, createRealtimeSession]);

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
