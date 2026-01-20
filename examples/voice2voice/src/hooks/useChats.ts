import { useState, useEffect, useCallback } from "react";
import {
  Chat,
  getAllChats,
  saveChat,
  deleteChat as dbDeleteChat,
} from "../lib/db";

export function useChats() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChats = useCallback(async () => {
    try {
      const allChats = await getAllChats();
      setChats(allChats);
    } catch (error) {
      console.error("Failed to load chats:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  const createChat = useCallback(
    async (modelName: string): Promise<Chat> => {
      const newChat: Chat = {
        id: `chat-${Date.now()}`,
        title: "New Chat",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        modelName,
      };
      await saveChat(newChat);
      await loadChats();
      return newChat;
    },
    [loadChats],
  );

  const updateChat = useCallback(
    async (chat: Chat): Promise<void> => {
      await saveChat(chat);
      await loadChats();
    },
    [loadChats],
  );

  const deleteChat = useCallback(
    async (id: string): Promise<void> => {
      await dbDeleteChat(id);
      await loadChats();
    },
    [loadChats],
  );

  const updateChatTitle = useCallback(
    async (chatId: string, title: string): Promise<void> => {
      const chat = chats.find((c) => c.id === chatId);
      if (chat) {
        await saveChat({ ...chat, title, updatedAt: new Date().toISOString() });
        await loadChats();
      }
    },
    [chats, loadChats],
  );

  return {
    chats,
    loading,
    createChat,
    updateChat,
    deleteChat,
    updateChatTitle,
    refreshChats: loadChats,
  };
}
