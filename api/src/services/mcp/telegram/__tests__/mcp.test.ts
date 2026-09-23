import express from "express";
import { AddressInfo } from "net";
import { Server } from "http";
import { RPCError } from "telegram/errors";
import { Api } from "telegram";

const getConnectedClient = jest.fn();
const forgetClient = jest.fn();

jest.mock("../client", () => ({
  ...jest.requireActual("../client"),
  getConnectedClient: (session: string) => getConnectedClient(session),
  forgetClient: (session: string) => forgetClient(session),
}));

import { MCP_SERVERS } from "../..";

let server: Server;
let url: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  const entry = MCP_SERVERS.telegram;
  app.all("/mcp/telegram", (req, res) => entry.handler(req, res, entry, "session-string"));
  server = app.listen(0);
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp/telegram`;
});

afterAll(() => new Promise(resolve => server.close(resolve)));

let nextId = 1;
async function rpc(method: string, params: object, sessionId?: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(sessionId ? { "mcp-session-id": sessionId, "mcp-protocol-version": "2025-03-26" } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  const raw = await res.text();
  const json = res.headers.get("content-type")?.includes("text/event-stream")
    ? JSON.parse(
        raw
          .split("\n")
          .find(line => line.startsWith("data: "))!
          .slice(6)
      )
    : JSON.parse(raw);
  return { json, sessionId: res.headers.get("mcp-session-id") || sessionId };
}

async function initialize() {
  const { sessionId } = await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  expect(sessionId).toBeTruthy();
  return sessionId!;
}

describe("telegram system MCP endpoint", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is registered as a system MCP that signs in its own way", () => {
    expect(MCP_SERVERS.telegram.authType).toBe("TELEGRAM");
    expect(MCP_SERVERS.telegram.authRouter).toBeDefined();
  });

  it("lists its tools without connecting to Telegram", async () => {
    const sessionId = await initialize();
    const { json } = await rpc("tools/list", {}, sessionId);
    expect(json.result.tools.map((t: { name: string }) => t.name)).toContain("send_message");
    expect(getConnectedClient).not.toHaveBeenCalled();
  });

  it("runs a tool on the client for the bearer session", async () => {
    getConnectedClient.mockResolvedValueOnce({ getDialogs: async () => [] });
    const sessionId = await initialize();

    const { json } = await rpc("tools/call", { name: "list_chats", arguments: {} }, sessionId);

    expect(getConnectedClient).toHaveBeenCalledWith("session-string");
    expect(json.result).toEqual({ content: [{ type: "text", text: "No chats found." }] });
  });

  it("reports a revoked session as a tool error and drops the cached client", async () => {
    getConnectedClient.mockRejectedValueOnce(new RPCError("AUTH_KEY_UNREGISTERED", new Api.help.GetConfig(), 401));
    const sessionId = await initialize();

    const { json } = await rpc("tools/call", { name: "list_chats", arguments: {} }, sessionId);

    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toMatch(/no longer valid.*Connect Telegram again/);
    expect(forgetClient).toHaveBeenCalledWith("session-string");
  });
});
