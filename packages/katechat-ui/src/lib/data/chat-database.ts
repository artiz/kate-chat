import { Chat, Message } from "@/core";
import { openDB, DBSchema, IDBPDatabase } from "idb";

interface ChatDBSchema extends DBSchema {
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

interface ChatDatabaseOptions {
  name?: string;
  version?: number;
}

export class ChatDatabase {
  #dbInstance: IDBPDatabase<ChatDBSchema> | null = null;
  #name: string;
  #version: number;

  constructor(options: ChatDatabaseOptions = {}) {
    const { name = "katechat-client-db", version = 1 } = options;
    this.#name = name;
    this.#version = version;
  }

  close() {
    if (this.#dbInstance) {
      this.#dbInstance.close();
      this.#dbInstance = null;
    }
  }

  private async getDB(): Promise<IDBPDatabase<ChatDBSchema>> {
    if (this.#dbInstance) {
      return this.#dbInstance;
    }

    this.#dbInstance = await openDB<ChatDBSchema>(this.#name, this.#version, {
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

    return this.#dbInstance;
  }

  // Chat operations
  async saveChat(chat: Chat): Promise<void> {
    const db = await this.getDB();
    await db.put("chats", chat);
  }

  async getChat(id: string): Promise<Chat | undefined> {
    const db = await this.getDB();
    return db.get("chats", id);
  }

  async getAllChats(): Promise<Chat[]> {
    const db = await this.getDB();
    return db.getAll("chats");
  }

  async deleteChat(id: string): Promise<void> {
    const db = await this.getDB();
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
  async saveMessage(message: Message): Promise<void> {
    const db = await this.getDB();
    await db.put("messages", message);
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const db = await this.getDB();
    return db.get("messages", id);
  }

  async getMessagesByChatId(chatId: string): Promise<Message[]> {
    const db = await this.getDB();
    const index = db.transaction("messages").store.index("by-chatId");
    return index.getAll(chatId);
  }

  async deleteMessage(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete("messages", id);
  }

  async deleteMessages(ids: string[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction("messages", "readwrite");
    for (const id of ids) {
      await tx.store.delete(id);
    }
    await tx.done;
  }
}
