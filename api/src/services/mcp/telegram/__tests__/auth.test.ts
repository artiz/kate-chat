import express from "express";
import { AddressInfo } from "net";
import { Server } from "http";
import { Api, helpers } from "teleproto";
import { RPCError } from "teleproto/errors";
import { generateToken } from "@/utils/jwt";
import { createTelegramAuthRouter } from "../auth";

const fake = {
  connect: jest.fn(async () => true),
  destroy: jest.fn(async () => undefined),
  sendCode: jest.fn(),
  invoke: jest.fn(),
  session: { save: jest.fn(() => "session-after-step") },
};
const created: string[] = [];

jest.mock("../client", () => ({
  ...jest.requireActual("../client"),
  createTelegramClient: (session = "") => {
    created.push(session);
    return fake;
  },
  getTelegramCredentials: () => ({ apiId: 1, apiHash: "hash" }),
}));

jest.mock("teleproto/Password", () => ({ computeCheck: jest.fn(async () => "srp-check") }));

const rpc = (message: string, code = 400) => new RPCError(message, new Api.help.GetConfig(), code);
const user = new Api.User({ id: helpers.returnBigInt(7), firstName: "Anna", username: "anna" });
const authorization = new Api.auth.Authorization({ user });

let server: Server;
let base: string;
const token = generateToken({ userId: "u1", email: "u1@example.com", roles: [] } as never);

const post = (path: string, body: object, auth = `Bearer ${token}`) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(body),
  }).then(async res => ({ status: res.status, body: await res.json() }));

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/mcp/telegram/auth", createTelegramAuthRouter());
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp/telegram/auth`;
});

afterAll(() => new Promise(resolve => server.close(resolve)));

beforeEach(() => {
  jest.clearAllMocks();
  created.length = 0;
});

describe("telegram login routes", () => {
  it("refuses callers without a KateChat login", async () => {
    const res = await post("/send-code", { phone: "+43 660 1234567" }, "");
    expect(res.status).toBe(401);
    expect(fake.sendCode).not.toHaveBeenCalled();
  });

  it("sends the code from a fresh session and hands that session back", async () => {
    fake.sendCode.mockResolvedValueOnce({ phoneCodeHash: "h1", isCodeViaApp: true });

    const res = await post("/send-code", { phone: "+43 (660) 123-45-67" });

    expect(res).toEqual({
      status: 200,
      body: { loginSession: "session-after-step", phoneCodeHash: "h1", via: "app" },
    });
    expect(created).toEqual([""]);
    expect(fake.sendCode).toHaveBeenCalledWith({ apiId: 1, apiHash: "hash" }, "+436601234567");
    expect(fake.destroy).toHaveBeenCalledTimes(1);
  });

  it("says when the code went to the login email, with its mask", async () => {
    fake.sendCode.mockResolvedValueOnce({
      phoneCodeHash: "h1",
      isCodeViaApp: false,
      emailCodeSent: true,
      emailOptions: { emailPattern: "a***@gmail.com" },
    });

    const res = await post("/send-code", { phone: "+1" });

    expect(res.body).toMatchObject({ via: "email", emailPattern: "a***@gmail.com" });
  });

  it("stops with instructions when Telegram wants a login email set up first", async () => {
    fake.sendCode.mockResolvedValueOnce({ phoneCodeHash: "h1", isCodeViaApp: false, emailRequired: true });

    const res = await post("/send-code", { phone: "+1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/set up a login email first/);
  });

  it("sends an emailed code as email verification, not as a phone code", async () => {
    fake.invoke.mockResolvedValueOnce(authorization);

    await post("/sign-in", { loginSession: "s1", phone: "+1", phoneCodeHash: "h1", code: "123456", via: "email" });

    const request = fake.invoke.mock.calls[0][0] as Api.auth.SignIn;
    expect(request.phoneCode).toBeUndefined();
    expect(request.emailVerification).toBeInstanceOf(Api.EmailVerificationCode);
    expect((request.emailVerification as Api.EmailVerificationCode).code).toBe("123456");
  });

  it("signs in on the session the code was sent from", async () => {
    fake.invoke.mockResolvedValueOnce(authorization);

    const res = await post("/sign-in", {
      loginSession: "s1",
      phone: "+436601234567",
      phoneCodeHash: "h1",
      code: "12 345",
    });

    expect(res).toEqual({
      status: 200,
      body: { session: "session-after-step", user: { name: "Anna", username: "anna" } },
    });
    expect(created).toEqual(["s1"]);
    const request = fake.invoke.mock.calls[0][0] as Api.auth.SignIn;
    expect(request).toBeInstanceOf(Api.auth.SignIn);
    expect(request.phoneCode).toBe("12345");
  });

  it("asks for the cloud password when two-step verification is on", async () => {
    fake.invoke
      .mockRejectedValueOnce(rpc("SESSION_PASSWORD_NEEDED", 401))
      .mockResolvedValueOnce(new Api.account.Password({ hint: "cat's name" } as never));

    const res = await post("/sign-in", { loginSession: "s1", phone: "+436601234567", phoneCodeHash: "h1", code: "1" });

    expect(res).toEqual({
      status: 200,
      body: { passwordRequired: true, hint: "cat's name", loginSession: "session-after-step" },
    });
    expect(fake.destroy).toHaveBeenCalledTimes(1);
  });

  it("explains a wrong code in words", async () => {
    fake.invoke.mockRejectedValueOnce(rpc("PHONE_CODE_INVALID"));

    const res = await post("/sign-in", { loginSession: "s1", phone: "+1", phoneCodeHash: "h1", code: "1" });

    expect(res).toEqual({ status: 400, body: { error: "The code is not correct.", code: "PHONE_CODE_INVALID" } });
    expect(fake.destroy).toHaveBeenCalledTimes(1);
  });

  it("refuses to sign up a number that has no account", async () => {
    fake.invoke.mockResolvedValueOnce(new Api.auth.AuthorizationSignUpRequired({}));

    const res = await post("/sign-in", { loginSession: "s1", phone: "+1", phoneCodeHash: "h1", code: "1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no Telegram account for this number/);
  });

  it("checks the password by SRP and returns the session", async () => {
    fake.invoke.mockResolvedValueOnce(new Api.account.Password({} as never)).mockResolvedValueOnce(authorization);

    const res = await post("/password", { loginSession: "s2", password: "secret" });

    expect(res.status).toBe(200);
    expect(res.body.session).toBe("session-after-step");
    const check = fake.invoke.mock.calls[1][0] as Api.auth.CheckPassword;
    expect(check).toBeInstanceOf(Api.auth.CheckPassword);
    expect(check.password).toBe("srp-check");
  });

  it("reports missing fields as a bad request without connecting", async () => {
    const res = await post("/sign-in", { loginSession: "s1", phone: "+1" });
    expect(res).toEqual({ status: 400, body: { error: "phoneCodeHash is required" } });
    expect(created).toEqual([]);
  });

  it("passes Telegram's rate limit on as 429", async () => {
    fake.sendCode.mockRejectedValueOnce(Object.assign(rpc("FLOOD_WAIT_42", 420), { seconds: 42 }));

    const res = await post("/send-code", { phone: "+1" });

    expect(res.status).toBe(429);
    expect(res.body.error).toBe("Telegram rate limit: retry in 42 seconds");
  });
});
