import { useState, useEffect, useCallback } from "react";
import { ChatDatabase } from "@/lib/data/chat-database";
import { assert } from "@/lib";
import { Chat } from "@/core/chat";

export function useDatabaseChats() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [db, setDb] = useState<ChatDatabase | null>(null);

  useEffect(() => {
    const chatDb = new ChatDatabase();
    setDb(chatDb);

    return () => {
      chatDb.close();
    };
  }, []);

  const loadChats = useCallback(async () => {
    if (!db) return;
    try {
      const allChats = await db.getAllChats();
      setChats(allChats);
    } catch (error) {
      console.error("Failed to load chats:", error);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  const createChat = useCallback(
    async (modelName: string): Promise<Chat> => {
      assert.ok(db, "Database instance is not available");
      const newChat: Chat = {
        id: `chat-${Date.now()}`,
        title: "New Chat",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (db) {
        await db.saveChat(newChat);
        await loadChats();
      }
      return newChat;
    },
    [db, loadChats]
  );

  const updateChat = useCallback(
    async (chat: Chat): Promise<void> => {
      assert.ok(db, "Database instance is not available");
      await db.saveChat(chat);
      await loadChats();
    },
    [db, loadChats]
  );

  const deleteChat = useCallback(
    async (id: string): Promise<void> => {
      assert.ok(db, "Database instance is not available");
      await db.deleteChat(id);
      await loadChats();
    },
    [db, loadChats]
  );

  const updateChatTitle = useCallback(
    async (chatId: string, title: string): Promise<void> => {
      const chat = chats.find(c => c.id === chatId);
      if (chat) {
        assert.ok(db, "Database instance is not available");
        await db.saveChat({
          ...chat,
          title,
          updatedAt: new Date().toISOString(),
        });
        await loadChats();
      }
    },
    [chats, db, loadChats]
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
