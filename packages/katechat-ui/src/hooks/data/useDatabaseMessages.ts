import { Message } from "@/core";
import { assert } from "@/lib";
import { ChatDatabase } from "@/lib/data";
import { useState, useEffect, useCallback } from "react";

export function useDatabaseMessages(chatId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [db, setDb] = useState<ChatDatabase | null>(null);

  useEffect(() => {
    const chatDb = new ChatDatabase();
    setDb(chatDb);

    return () => {
      chatDb.close();
    };
  }, []);

  const loadMessages = useCallback(async () => {
    if (!chatId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      assert.ok(db, "Database instance is not available");
      const chatMessages = await db.getMessagesByChatId(chatId);
      setMessages(chatMessages);
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setLoading(false);
    }
  }, [chatId, db]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const addMessage = useCallback(
    async (message: Message): Promise<void> => {
      if (!chatId) return;
      assert.ok(db, "Database instance is not available");

      await db.saveMessage(message);
      setMessages(prev => [...prev, message]);

      // Update chat's updatedAt timestamp
      const chat = await db.getChat(chatId);
      if (chat) {
        await db.saveChat({ ...chat, updatedAt: new Date().toISOString() });
      }
    },
    [chatId, db]
  );

  const updateMessage = useCallback(
    async (message: Message): Promise<void> => {
      assert.ok(db, "Database instance is not available");
      await db.saveMessage(message);
      setMessages(prev => prev.map(m => (m.id === message.id ? message : m)));
    },
    [db]
  );

  const deleteMessage = useCallback(
    async (id: string): Promise<void> => {
      assert.ok(db, "Database instance is not available");
      await db.deleteMessage(id);
      setMessages(prev => prev.filter(m => m.id !== id));
    },
    [db]
  );

  const deleteMessages = useCallback(
    async (ids: string[]): Promise<void> => {
      assert.ok(db, "Database instance is not available");
      await db.deleteMessages(ids);
      setMessages(prev => prev.filter(m => !ids.includes(m.id)));
    },
    [db]
  );

  const clearMessages = useCallback(async (): Promise<void> => {
    if (!chatId) return;
    const messageIds = messages.map(m => m.id);
    assert.ok(db, "Database instance is not available");
    await db.deleteMessages(messageIds);
    setMessages([]);
  }, [chatId, messages, db]);

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
