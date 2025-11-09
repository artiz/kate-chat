import { useState, useEffect, useCallback } from "react";
import { Message } from "@katechat/ui";
import {
  getMessagesByChatId,
  saveMessage,
  deleteMessage as dbDeleteMessage,
  deleteMessages as dbDeleteMessages,
  saveChat,
  getChat,
} from "../lib/db";

export function useMessages(chatId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMessages = useCallback(async () => {
    if (!chatId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      const chatMessages = await getMessagesByChatId(chatId);
      setMessages(chatMessages);
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const addMessage = useCallback(
    async (message: Message): Promise<void> => {
      if (!chatId) return;

      await saveMessage(message);
      setMessages((prev) => [...prev, message]);

      // Update chat's updatedAt timestamp
      const chat = await getChat(chatId);
      if (chat) {
        await saveChat({ ...chat, updatedAt: new Date().toISOString() });
      }
    },
    [chatId],
  );

  const updateMessage = useCallback(async (message: Message): Promise<void> => {
    await saveMessage(message);
    setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
  }, []);

  const deleteMessage = useCallback(async (id: string): Promise<void> => {
    await dbDeleteMessage(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const deleteMessages = useCallback(async (ids: string[]): Promise<void> => {
    await dbDeleteMessages(ids);
    setMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
  }, []);

  const clearMessages = useCallback(async (): Promise<void> => {
    if (!chatId) return;
    const messageIds = messages.map((m) => m.id);
    await dbDeleteMessages(messageIds);
    setMessages([]);
  }, [chatId, messages]);

  return {
    messages,
    loading,
    addMessage,
    updateMessage,
    deleteMessage,
    deleteMessages,
    clearMessages,
    refreshMessages: loadMessages,
  };
}
