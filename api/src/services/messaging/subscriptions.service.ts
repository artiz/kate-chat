import { PubSub } from "graphql-subscriptions";
import { createClient, RedisClientType } from "redis";

import { Message } from "@/entities/Message";
import { createLogger } from "@/utils/logger";
import { ok } from "@/utils/assert";
import { MessageRole } from "@/types/api";
import { Document } from "@/entities/Document";
import { DocumentStatusMessage, MessageChatInfo } from "@/types/graphql/responses";
import { Chat } from "@/entities";
import EventEmitter from "events";
import { globalConfig } from "@/global-config";

const redisCfg = globalConfig.redis;

const logger = createLogger(__filename);

interface MessageCacheData {
  message: Message;
  chat: MessageChatInfo;
}

export class SubscriptionsService extends EventEmitter {
  private connectionError: boolean = false;
  private redisClient: RedisClientType | null = null;
  private redisSub: RedisClientType | null = null;

  // one staticGraphQL PubSub instance for subscriptions
  private static _pubSub: PubSub;

  public static get pubSub(): PubSub {
    if (!SubscriptionsService._pubSub) {
      SubscriptionsService._pubSub = new PubSub();
    }

    return SubscriptionsService._pubSub;
  }

  constructor() {
    super();

    // init Redis client for storing messages and PubSub
    // NOTE: Redis connection is optional - application works without Redis
    // but will not share messages between multiple instances
    if (!redisCfg.url) {
      logger.warn("Redis URL not configured - multi-instance support disabled");
      return;
    }

    try {
      const client: RedisClientType = createClient({
        url: redisCfg.url,
        socket: {
          reconnectStrategy: (retries: number) => {
            if (retries > 5) {
              logger.warn("Redis connection refused - multi-instance support disabled");
              return false; // Stop reconnecting after 5 retries
            }
            // Exponential backoff with a maximum delay of 3 seconds
            const delay = Math.min(Math.pow(2, retries) * 100, 3000);
            return delay;
          },
        },
      });

      this.redisClient = client;

      // Add event listeners for Redis connection
      client.on("error", (err: Error) => {
        const message = err.name === "AggregateError" ? (err as any).code : err.message;
        // Only log once to avoid flooding
        if (message?.includes("ECONNREFUSED")) {
          if (!this.connectionError) {
            logger.error(err, "Redis connection error");
            this.connectionError = true;
          }
        } else {
          logger.error(err, "Redis client error");
        }
      });

      const redisSub = client.duplicate();
      this.redisSub = redisSub;

      client.on("connect", () => {
        logger.info("Redis connected - multi-instance support enabled");

        // subscribe to PubSub channels
        // Setup listener for receiving messages
        (async () => {
          try {
            await redisSub.connect();

            await redisSub.subscribe(
              [redisCfg.channelChatMessage, redisCfg.channelChatError, redisCfg.channelDocumentStatus],
              async (message: string, channel: string) => {
                try {
                  const data = JSON.parse(message);

                  if (channel === redisCfg.channelDocumentStatus) {
                    this.emit(channel, data);
                    await SubscriptionsService.pubSub.publish(redisCfg.channelDocumentStatus, data);
                    return;
                  }

                  const { chatId, messageId, error, streaming } = data;
                  if (channel === redisCfg.channelChatError) {
                    this.emit(channel, data);
                    return await SubscriptionsService.pubSub.publish(redisCfg.channelChatMessage, {
                      chatId,
                      data: { error: error || "Unknown error" },
                    });
                  }

                  // Get message from Redis
                  const messageData = await this.getMessageData(messageId);
                  if (messageData) {
                    const { message, chat } = messageData;
                    this.emit(channel, {
                      chat,
                      message,
                      streaming,
                    });

                    // Send to client via GraphQL PubSub
                    await SubscriptionsService.pubSub.publish(redisCfg.channelChatMessage, {
                      chatId,
                      data: {
                        error: message.role === MessageRole.ERROR ? message.content : null,
                        chat,
                        message,
                        streaming,
                      },
                    });
                  } else {
                    logger.error(error, `Sync error: message ${messageId} not found in Redis`);
                    await SubscriptionsService.pubSub.publish(redisCfg.channelChatMessage, {
                      chatId,
                      data: { error: "Sync error: message not found in cache" },
                    });
                  }
                } catch (error) {
                  logger.error(error, "Error processing Redis message");
                }
              }
            );
          } catch (error) {
            logger.error(error, "Failed to subscribe to Redis PubSub");
          }
        })();
      });

      // Attempt to connect but don't block startup
      this.redisClient.connect().catch(() => {});
    } catch (error) {
      logger.error(error, "Error creating Redis client");
      this.redisClient = null;
      this.redisSub = null;
    }
  }

  async publishChatError(chatId: string, error: string): Promise<void> {
    // Publish directly if Redis is not configured
    if (!this.redisClient || !this.redisClient.isOpen) {
      return await SubscriptionsService.pubSub.publish(redisCfg.channelChatMessage, {
        chatId,
        data: { error },
      });
    }

    try {
      // Broadcast error to all clients using Redis PubSub
      await this.redisClient.publish(redisCfg.channelChatError, JSON.stringify({ chatId, error }));
    } catch (err) {
      logger.error(err, `Failed to publish error for chat ${chatId} in Redis`);
      // fallback to publish if Redis fails
      return await SubscriptionsService.pubSub.publish(redisCfg.channelChatMessage, {
        chatId,
        data: { error },
      });
    }
  }

  async publishChatMessage(chat: Chat, message: Message, streaming = false): Promise<void> {
    const chatId = chat.id;
    // Publish directly if Redis is not configured
    if (!this.redisClient || !this.redisClient.isOpen || !this.redisSub) {
      return await SubscriptionsService.pubSub.publish(redisCfg.channelChatMessage, {
        chatId,
        data: { message, chat, streaming },
      });
    }

    ok(message.id);
    const messageId = message.id;

    try {
      await this.redisClient.set(
        `message:${messageId}`,
        JSON.stringify({ message, chat }),
        { EX: redisCfg.chatMessageExpirationSec } // message expiration to prevent stale data
      );

      // Broadcast message to all clients using Redis PubSub
      await this.redisClient.publish(redisCfg.channelChatMessage, JSON.stringify({ chatId, messageId, streaming }));
    } catch (error: unknown) {
      logger.error(error, `Failed to publish message ${messageId} in Redis`);

      // fallback to publish if Redis fails
      return await SubscriptionsService.pubSub.publish(redisCfg.channelChatMessage, {
        chatId,
        data: { message, chat, streaming },
      });
    }
  }

  async publishDocumentStatus(document: Document): Promise<void> {
    const message: DocumentStatusMessage = {
      documentId: document.id,
      status: document.status,
      statusInfo: document.statusInfo,
      statusProgress: document.statusProgress,
      summary: document.summary,
      updatedAt: document.updatedAt,
    };

    // Publish directly if Redis is not configured
    if (!this.redisClient || !this.redisClient.isOpen) {
      return await SubscriptionsService.pubSub.publish(redisCfg.channelDocumentStatus, message);
    }

    try {
      // Broadcast message to all clients using Redis PubSub
      await this.redisClient.publish(redisCfg.channelDocumentStatus, JSON.stringify(message));
    } catch (error: unknown) {
      logger.error(error, `Failed to publish document status for document ${document.id} in Redis`);

      // fallback to publish if Redis fails
      return await SubscriptionsService.pubSub.publish(redisCfg.channelDocumentStatus, message);
    }
  }

  // Get message from Redis
  async getMessageData(messageId: string): Promise<MessageCacheData | null> {
    ok(this.redisClient);
    ok(this.redisClient.isOpen);

    try {
      const data = await this.redisClient.get(`message:${messageId}`);
      if (!data) return null;
      return JSON.parse(data) as MessageCacheData;
    } catch (error) {
      logger.error(error, `Failed to get message ${messageId} from Redis`);
      return null;
    }
  }

  async shutdown(): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
        logger.info("Redis client disconnected");
        this.redisClient = null;
      } catch (error) {
        logger.error(error, "Error disconnecting Redis client");
      }
    }

    if (this.redisSub) {
      try {
        await this.redisSub.quit();
        logger.info("Redis subscriptions client disconnected");
        this.redisSub = null;
      } catch (error) {
        logger.error(error, "Error disconnecting Redis subscriptions client");
      }
    }
  }
}
