import { openDB, DBSchema, IDBPDatabase } from "idb";
import { Message } from "@katechat/ui";

export interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  isPinned?: boolean;
  modelName: string;
}

interface ChatDB extends DBSchema {
  chats: {
    key: string;
    value: Chat;
    indexes: {
      "by-updatedAt": string;
    };
  };
  messages: {
    key: string;
    value: Message;
    indexes: {
      "by-chatId": string;
      "by-createdAt": string;
    };
  };
}

const DB_NAME = "openai-client-db";
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<ChatDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<ChatDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<ChatDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create chats store
      if (!db.objectStoreNames.contains("chats")) {
        const chatStore = db.createObjectStore("chats", { keyPath: "id" });
        chatStore.createIndex("by-updatedAt", "updatedAt");
      }

      // Create messages store
      if (!db.objectStoreNames.contains("messages")) {
        const messageStore = db.createObjectStore("messages", {
          keyPath: "id",
        });
        messageStore.createIndex("by-chatId", "chatId");
        messageStore.createIndex("by-createdAt", "createdAt");
      }
    },
  });

  return dbInstance;
}

// Chat operations
export async function saveChat(chat: Chat): Promise<void> {
  const db = await getDB();
  await db.put("chats", chat);
}

export async function getChat(id: string): Promise<Chat | undefined> {
  const db = await getDB();
  return db.get("chats", id);
}

export async function getAllChats(): Promise<Chat[]> {
  const db = await getDB();
  return db.getAll("chats");
}

export async function deleteChat(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["chats", "messages"], "readwrite");

  // Delete chat
  await tx.objectStore("chats").delete(id);

  // Delete all messages for this chat
  const messageIndex = tx.objectStore("messages").index("by-chatId");
  const messages = await messageIndex.getAllKeys(id);
  for (const messageId of messages) {
    await tx.objectStore("messages").delete(messageId);
  }

  await tx.done;
}

// Message operations
export async function saveMessage(message: Message): Promise<void> {
  const db = await getDB();
  await db.put("messages", message);
}

export async function getMessage(id: string): Promise<Message | undefined> {
  const db = await getDB();
  return db.get("messages", id);
}

export async function getMessagesByChatId(chatId: string): Promise<Message[]> {
  const db = await getDB();
  const index = db.transaction("messages").store.index("by-chatId");
  return index.getAll(chatId);
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("messages", id);
}

export async function deleteMessages(ids: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("messages", "readwrite");
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
}
