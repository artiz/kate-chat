import crypto from "crypto";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { Logger, LogLevel } from "teleproto/extensions/Logger";
import { RPCError } from "teleproto/errors";
import { createLogger } from "@/utils/logger";

const logger = createLogger(__filename);

/**
 * One Telegram application (api_id/api_hash from https://my.telegram.org) serves every user of the
 * instance, the way one OAuth client serves Gmail. What is per user is the session string a login
 * produces: it is the whole account, so it is kept where the other MCP tokens are, in the user's
 * browser, and arrives here as the bearer token of each request.
 */
export interface TelegramCredentials {
  apiId: number;
  apiHash: string;
}

export function getTelegramCredentials(): TelegramCredentials {
  const apiId = Number(process.env.MCP_SERVER_TELEGRAM_API_ID);
  const apiHash = process.env.MCP_SERVER_TELEGRAM_API_HASH;
  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
    throw new Error(
      "Telegram is not configured: set MCP_SERVER_TELEGRAM_API_ID and MCP_SERVER_TELEGRAM_API_HASH (https://my.telegram.org)"
    );
  }
  return { apiId, apiHash };
}

export function createTelegramClient(session = ""): TelegramClient {
  const { apiId, apiHash } = getTelegramCredentials();
  return new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 3,
    deviceModel: "KateChat",
    appVersion: "1.0",
    // teleproto reports every connection step at INFO on stdout, outside the app's logger.
    baseLogger: new Logger(LogLevel.ERROR),
  });
}

/**
 * Connecting costs a key exchange and a round trip to the user's data centre, a second or more,
 * and a model calls several tools in a row. Clients are kept for a while per session and dropped
 * once idle. The key is a hash so the session itself is never held as a map key or logged.
 */
const IDLE_TTL_MS = 10 * 60 * 1000;

interface CachedClient {
  client: Promise<TelegramClient>;
  lastUsed: number;
}

const clients = new Map<string, CachedClient>();

const sessionKey = (session: string) => crypto.createHash("sha256").update(session).digest("hex");

const destroy = (key: string, entry: CachedClient) => {
  clients.delete(key);
  entry.client.then(client => client.destroy()).catch(err => logger.debug(err, "Telegram client destroy failed"));
};

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of clients) {
    if (now - entry.lastUsed > IDLE_TTL_MS) destroy(key, entry);
  }
}, 60 * 1000);
sweep.unref();

export async function getConnectedClient(session: string): Promise<TelegramClient> {
  const key = sessionKey(session);
  const cached = clients.get(key);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.client;
  }

  const client = (async () => {
    const client = createTelegramClient(session);
    await client.connect();
    if (!(await client.checkAuthorization())) {
      await client.destroy();
      throw new TelegramSessionError();
    }
    return client;
  })();

  const entry: CachedClient = { client, lastUsed: Date.now() };
  clients.set(key, entry);
  // A failed connect must not stay cached, or every later call would get the same rejection.
  client.catch(() => clients.get(key) === entry && clients.delete(key));
  return client;
}

/** Drops a client whose session Telegram no longer accepts, so the next call reconnects. */
export function forgetClient(session: string) {
  const key = sessionKey(session);
  const entry = clients.get(key);
  if (entry) destroy(key, entry);
}

export class TelegramSessionError extends Error {
  constructor() {
    super("The Telegram session is no longer valid (logged out or revoked in Telegram). Connect Telegram again.");
  }
}

const SESSION_ERRORS = ["AUTH_KEY_UNREGISTERED", "SESSION_REVOKED", "SESSION_EXPIRED", "USER_DEACTIVATED"];

export const isSessionError = (err: unknown) =>
  err instanceof TelegramSessionError ||
  (err instanceof RPCError && SESSION_ERRORS.some(code => err.errorMessage.startsWith(code)));

/** Human-readable text for the RPC errors a user or a model can do something about. */
export function describeTelegramError(err: unknown): string {
  if (isSessionError(err)) return new TelegramSessionError().message;
  if (err instanceof RPCError) {
    const seconds = (err as RPCError & { seconds?: number }).seconds;
    if (err.errorMessage.startsWith("FLOOD_WAIT") || seconds) {
      return `Telegram rate limit: retry in ${seconds ?? "a few"} seconds`;
    }
    return `Telegram error ${err.code}: ${err.errorMessage}`;
  }
  return err instanceof Error ? err.message : String(err);
}
