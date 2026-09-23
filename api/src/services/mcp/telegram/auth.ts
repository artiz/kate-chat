import { Router, Request, Response } from "express";
import { Api, TelegramClient } from "teleproto";
import { RPCError } from "teleproto/errors";
import { computeCheck } from "teleproto/Password";
import { verifyToken } from "@/utils/jwt";
import { createLogger } from "@/utils/logger";
import { createTelegramClient, describeTelegramError, getTelegramCredentials } from "./client";

const logger = createLogger(__filename);

/**
 * Telegram has no OAuth: an account signs in with its phone number, the code Telegram sends to the
 * app, and the cloud password when two-step verification is on. The three steps run on one
 * session, so each response hands the session back to the browser and the next request resumes it.
 * Nothing is held here between steps, the same way no MCP token is held here at all.
 *
 * The routes require a KateChat login: they spend the instance's api_id, and an open endpoint would
 * let anyone make Telegram send login codes to any number.
 */

type LoginResult =
  | { session: string; user: { name: string; username?: string } }
  | { passwordRequired: true; hint?: string; loginSession: string };

const USER_ERRORS: Record<string, string> = {
  PHONE_NUMBER_INVALID: "The phone number is not valid. Use the international format, e.g. +43 660 1234567.",
  PHONE_NUMBER_BANNED: "This phone number is banned by Telegram.",
  PHONE_CODE_INVALID: "The code is not correct.",
  PHONE_CODE_EXPIRED: "The code has expired. Request a new one.",
  PHONE_CODE_EMPTY: "Enter the code Telegram sent you.",
  PASSWORD_HASH_INVALID: "The password is not correct.",
  EMAIL_CODE_INVALID: "The code is not correct.",
};

const EMAIL_SETUP_REQUIRED =
  "Telegram asks this account to set up a login email first. Sign in once in an official Telegram app, set the email there, then try again.";

const describeUser = (user: Api.TypeUser) => {
  if (!(user instanceof Api.User)) return { name: "Telegram" };
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Telegram";
  return { name, username: user.username || undefined };
};

const authorized = (client: TelegramClient, authorization: Api.auth.TypeAuthorization): LoginResult => {
  if (authorization instanceof Api.auth.AuthorizationSignUpRequired) {
    throw new LoginError("There is no Telegram account for this number. Sign up in a Telegram app first.");
  }
  return { session: String(client.session.save()), user: describeUser(authorization.user) };
};

async function withClient<T>(session: string, run: (client: TelegramClient) => Promise<T>): Promise<T> {
  const client = createTelegramClient(session);
  try {
    await client.connect();
    return await run(client);
  } finally {
    await client.destroy().catch(err => logger.debug(err, "Telegram login client destroy failed"));
  }
}

async function checkPassword(client: TelegramClient, password: string): Promise<LoginResult> {
  const srp = await client.invoke(new Api.account.GetPassword());
  const check = await computeCheck(srp, password);
  return authorized(client, await client.invoke(new Api.auth.CheckPassword({ password: check })));
}

class LoginError extends Error {}

const requireString = (body: Record<string, unknown>, field: string): string => {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new LoginError(`${field} is required`);
  return value.trim();
};

const normalizePhone = (phone: string) => phone.replace(/[^\d+]/g, "");

export function createTelegramAuthRouter(): Router {
  const router = Router();

  router.use((req: Request, res: Response, next) => {
    const header = req.headers.authorization;
    try {
      if (!header?.startsWith("Bearer ") || !verifyToken(header.slice(7))) throw new Error();
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });

  const handle = (step: (body: Record<string, unknown>) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      res.json(await step(req.body || {}));
    } catch (err) {
      if (err instanceof LoginError) {
        res.status(400).json({ error: err.message });
      } else if (err instanceof RPCError) {
        const known = Object.entries(USER_ERRORS).find(([code]) => err.errorMessage.startsWith(code));
        const status = err.errorMessage.startsWith("FLOOD_WAIT") ? 429 : 400;
        res.status(status).json({ error: known?.[1] || describeTelegramError(err), code: err.errorMessage });
      } else {
        logger.error(err, "Telegram login failed");
        res.status(500).json({ error: describeTelegramError(err) });
      }
    }
  };

  // Step 1: Telegram sends a code to the account's apps (or by SMS when there are none).
  router.post(
    "/send-code",
    handle(async body => {
      const phone = normalizePhone(requireString(body, "phone"));
      return withClient("", async client => {
        const sent = await client.sendCode(getTelegramCredentials(), phone);
        if (sent.emailRequired) throw new LoginError(EMAIL_SETUP_REQUIRED);
        // Accounts with a login email get the code there rather than in the app.
        const via = sent.emailCodeSent ? "email" : sent.isCodeViaApp ? "app" : "sms";
        return {
          loginSession: String(client.session.save()),
          phoneCodeHash: sent.phoneCodeHash,
          via,
          emailPattern: sent.emailOptions?.emailPattern,
        };
      });
    })
  );

  // Step 2: the code. Accounts with two-step verification answer SESSION_PASSWORD_NEEDED here.
  router.post(
    "/sign-in",
    handle(async body => {
      const loginSession = requireString(body, "loginSession");
      const phoneNumber = normalizePhone(requireString(body, "phone"));
      const phoneCodeHash = requireString(body, "phoneCodeHash");
      const code = requireString(body, "code").replace(/\s/g, "");
      // A code from the login email is a different field of the same request.
      const credential =
        body.via === "email" ? { emailVerification: new Api.EmailVerificationCode({ code }) } : { phoneCode: code };

      return withClient(loginSession, async client => {
        try {
          return authorized(
            client,
            await client.invoke(new Api.auth.SignIn({ phoneNumber, phoneCodeHash, ...credential }))
          );
        } catch (err) {
          if (!(err instanceof RPCError) || err.errorMessage !== "SESSION_PASSWORD_NEEDED") throw err;
          const { hint } = await client.invoke(new Api.account.GetPassword());
          return { passwordRequired: true, hint, loginSession: String(client.session.save()) };
        }
      });
    })
  );

  // Step 3, only with two-step verification: the cloud password, checked by SRP, never sent as is.
  router.post(
    "/password",
    handle(async body => {
      const loginSession = requireString(body, "loginSession");
      const password = body.password;
      if (typeof password !== "string" || !password) throw new LoginError("password is required");
      return withClient(loginSession, client => checkPassword(client, password));
    })
  );

  return router;
}
