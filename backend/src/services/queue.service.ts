import { PubSub } from "graphql-subscriptions";
import { createClient, RedisClientType } from "redis";

import { NEW_MESSAGE } from "@/resolvers/message.resolver";
import { Message } from "@/entities/Message";
import { createLogger } from "@/utils/logger";
import { WebSocket } from "ws";
import { ok } from "@/utils/assert";
import { QUEUE_MESSAGE_EXPIRATION_SEC, REDIS_URL } from "@/config/application";
import { MessageRole } from "@/types/ai.types";

const logger = createLogger(__filename);

// PubSub channel for broadcasting messages
export const CHAT_MESSAGES_CHANNEL = "chat:messages";
export const CHAT_ERRORS_CHANNEL = "chat:errors";

export class QueueService {
  private pubSub: PubSub;
  private redisClient: RedisClientType | null = null;

  private static subscriptions: Map<string, RedisClientType> = new Map<string, RedisClientType>();

  constructor(pubSub: PubSub) {
    this.pubSub = pubSub;

    // init Redis client for storing messages and PubSub
    // NOTE: Redis connection is optional - application works without Redis
    // but will not share messages between multiple instances
    if (!REDIS_URL) {
      logger.warn("Redis URL not configured - multi-instance support disabled");
      return;
    }

    try {
      const client: RedisClientType = createClient({
        url: REDIS_URL,
        socket: {
          reconnectStrategy: (retries: number) => {
            if (retries > 10) {
              logger.warn("Redis connection refused - multi-instance support disabled");
              return false; // Stop reconnecting after 10 retries
            }
            // Exponential backoff with a maximum delay of 5 seconds
            const delay = Math.min(Math.pow(2, retries) * 100, 5000);
            return delay;
          },
        },
      });

      this.redisClient = client;

      // Add event listeners for Redis connection
      this.redisClient.on("error", (err: Error) => {
        // Only log once to avoid flooding
        if (!err.message.includes("ECONNREFUSED")) {
          logger.error(err, "Redis client error");
        }
      });

      this.redisClient.on("connect", () => {
        logger.info("Redis connected - multi-instance support enabled");
      });

      // Attempt to connect but don't block startup
      this.redisClient.connect().catch(() => {});
    } catch (error) {
      logger.error(error, "Error creating Redis client");
      this.redisClient = null;
    }
  }

  connectClient(socket: WebSocket, clientChatId: string) {
    // Only setup Redis subscriber if Redis is available
    if (!this.redisClient || !this.redisClient.isReady) return;

    try {
      const subscriber = this.redisClient.duplicate();

      // Add error handling for subscriber
      subscriber.on("error", (err: Error) => {
        // Only log non-connection errors to avoid noise
        if (!err.message.includes("ECONNREFUSED")) {
          logger.error(err, "Redis subscriber error");
        }
      });

      // Setup listener for receiving messages
      (async () => {
        try {
          await subscriber.connect();

          if (subscriber.isOpen) {
            QueueService.subscriptions.set(clientChatId, subscriber);

            await subscriber.subscribe(
              [CHAT_MESSAGES_CHANNEL, CHAT_ERRORS_CHANNEL],
              async (message: string, channel: string) => {
                logger.trace({ channel, message }, `Received message on Redis channel ${channel}`);

                try {
                  const data = JSON.parse(message);
                  const { chatId, messageId, error, streaming } = data;

                  if (clientChatId === chatId) {
                    if (channel === CHAT_ERRORS_CHANNEL) {
                      return await this.pubSub.publish(NEW_MESSAGE, {
                        chatId,
                        data: { error: error || "Unknown error" },
                      });
                    }

                    // Get message from Redis
                    const messageData = await this.getMessage(messageId);
                    if (messageData) {
                      // Send to client via GraphQL PubSub
                      await this.pubSub.publish(NEW_MESSAGE, {
                        chatId,

                        data: {
                          error: messageData.role === MessageRole.ERROR ? messageData.content : null,
                          message: messageData,
                          streaming,
                        },
                      });
                    }
                  }
                } catch (error) {
                  logger.error(error, "Error processing Redis message");
                }
              }
            );
          }
        } catch (error) {
          logger.error(error, "Failed to subscribe to Redis PubSub");
        }
      })();

      // Store subscriber in client data for cleanup
      socket.on("close", () => {
        if (subscriber && subscriber.isOpen) {
          logger.debug(`Disconnected Redis subscriber for chat ${clientChatId}`);
          subscriber.quit().catch(() => {});
          QueueService.subscriptions.delete(clientChatId);
        }
      });
    } catch (error) {
      // Redis subscriber setup failed, but application can continue
      logger.warn("Failed to setup Redis subscriber, continuing without it");
    }
  }

  disconnectClient(socket: WebSocket, chatId: string | undefined) {
    // Only disconnect if Redis is available
    if (!this.redisClient || !this.redisClient.isReady) return;

    // Remove subscriber for the specific chatId
    const subscriber = QueueService.subscriptions.get(chatId || "");
    if (subscriber && subscriber.isOpen) {
      subscriber.quit().catch(() => {});
      QueueService.subscriptions.delete(chatId || "");
    }
  }

  async publishError(chatId: string, error: string): Promise<void> {
    // Publish directly if Redis is not configured
    if (!this.redisClient || !this.redisClient.isOpen) {
      return await this.pubSub.publish(NEW_MESSAGE, {
        chatId,
        data: { error },
      });
    }

    try {
      // Broadcast error to all clients using Redis PubSub
      await this.redisClient.publish(CHAT_ERRORS_CHANNEL, JSON.stringify({ chatId, error }));
    } catch (err) {
      logger.error(err, `Failed to publish error for chat ${chatId} in Redis`);
    }
  }

  async publishMessage(chatId: string, message: Message, streaming = false): Promise<void> {
    // Publish directly if Redis is not configured
    if (!this.redisClient || !this.redisClient.isOpen) {
      return await this.pubSub.publish(NEW_MESSAGE, {
        chatId,
        data: { message, streaming },
      });
    }

    ok(message.id);
    const messageId = message.id;

    try {
      await this.redisClient.set(
        `message:${messageId}`,
        JSON.stringify(message),
        { EX: QUEUE_MESSAGE_EXPIRATION_SEC } // message expiration to prevent stale data
      );

      // Broadcast message to all clients using Redis PubSub
      await this.redisClient.publish(CHAT_MESSAGES_CHANNEL, JSON.stringify({ chatId, messageId, streaming }));
    } catch (error) {
      logger.error(error, `Failed to publish message ${messageId} in Redis`);

      // fallback to publish if Redis fails
      return await this.pubSub.publish(NEW_MESSAGE, {
        chatId,
        data: { error },
      });
    }
  }

  // Get message from Redis
  async getMessage(messageId: string): Promise<Message | null> {
    ok(this.redisClient);
    ok(this.redisClient.isOpen);

    try {
      const data = await this.redisClient.get(`message:${messageId}`);
      if (!data) return null;
      return JSON.parse(data) as Message;
    } catch (error) {
      logger.error(error, `Failed to get message ${messageId} from Redis`);
      return null;
    }
  }
}
