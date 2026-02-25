import { createClient, RedisClientType } from "redis";
import { globalConfig } from "@/global-config";
import { createLogger } from "@/utils/logger";

const logger = createLogger(__filename);

export function createRedisClient(warnMessage?: string, reconnectWarn?: string): RedisClientType | null {
  const redisCfg = globalConfig.redis;

  // NOTE: Redis connection is optional - application works without Redis
  // but will not share messages between multiple instances and will not work with distributed locks
  if (!redisCfg.url) {
    warnMessage && logger.warn(warnMessage);
    return null;
  }

  let connectionError = false;

  const client: RedisClientType = createClient({
    url: redisCfg.url,
    socket: {
      reconnectStrategy: (retries: number) => {
        if (retries > 5) {
          reconnectWarn && logger.warn(reconnectWarn);
          return false; // Stop reconnecting after 5 retries
        }
        // Exponential backoff with a maximum delay of 3 seconds
        const delay = Math.min(Math.pow(2, retries) * 100, 3000);
        return delay;
      },
    },
  });

  // Add event listeners for Redis connection
  client.on("error", (err: Error) => {
    const message = err.name === "AggregateError" ? (err as any).code : err.message;
    // Only log once to avoid flooding
    if (message?.includes("ECONNREFUSED")) {
      if (!connectionError) {
        logger.error(err, "Redis connection error");
        connectionError = true;
      }
    } else {
      logger.error(err, "Redis client error");
    }
  });

  return client;
}

interface LockValue<V> {
  value: V;
  ts: NodeJS.Timeout;
}

export class QueueLockService<K, V> {
  private prefix: string;
  private memoryStore: Map<K, LockValue<V>> = new Map();
  private redisClient: RedisClientType | null = null;
  private expirationMs: number;

  constructor(prefix: string, expitionMs: number = 2000) {
    this.prefix = prefix;
    this.expirationMs = expitionMs;
    this.redisClient = createRedisClient();

    try {
      const client = createRedisClient("Redis URL not configured - only local in-memory locks will work");

      if (!client) {
        return;
      }

      this.redisClient = client;

      // Attempt to connect but don't block startup
      this.redisClient.connect().catch(() => {});
    } catch (error) {
      logger.error(error, "Error creating Redis client");
      this.redisClient = null;
    }
  }

  async putLock(key: K, value: V): Promise<void> {
    const lockKey = `${this.prefix}:${key}`;
    if (this.redisClient) {
      await this.redisClient.set(lockKey, JSON.stringify(value), {
        EX: this.expirationMs / 1000, // expiration in seconds
      });
    } else {
      const existing = this.memoryStore.get(key);
      if (existing) {
        clearTimeout(existing.ts);
      }
      const ts = setTimeout(() => this.memoryStore.delete(key), this.expirationMs);
      this.memoryStore.set(key, { value, ts });
    }
  }

  async releaseLock(key: K): Promise<void> {
    const lockKey = `${this.prefix}:${key}`;
    if (this.redisClient) {
      await this.redisClient.del(lockKey);
    } else {
      const existing = this.memoryStore.get(key);
      if (existing) {
        clearTimeout(existing.ts);
        this.memoryStore.delete(key);
      }
    }
  }

  async checkLock(key: K): Promise<V | null> {
    const lockKey = `${this.prefix}:${key}`;
    let v: V | null = null;
    if (this.redisClient) {
      const val = await this.redisClient.get(lockKey);
      v = val ? (JSON.parse(val) as V) : null;
    } else {
      v = this.memoryStore.get(key)?.value || null;
    }

    if (v) {
      return v;
    }

    return null;
  }
}
