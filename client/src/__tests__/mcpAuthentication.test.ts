jest.mock("@katechat/ui", () => ({ assert: { notEmpty: (value: unknown) => value != null } }));
jest.mock("../components/auth/TelegramLogin", () => ({ TelegramLogin: () => null }));

import en from "../i18n/locales/en.json";
import de from "../i18n/locales/de.json";
import ru from "../i18n/locales/ru.json";
import zh from "../i18n/locales/zh.json";
import {
  getChatMcpTokens,
  getMcpAuthToken,
  hasValidMcpToken,
  MCPAuthType,
  requiresAuth,
  requiresSignIn,
  requiresTokenEntry,
  storeMcpSession,
  storeMcpToken,
} from "../components/auth/McpAuthentication";
import { MCPServer, ToolType } from "../types/graphql";

const server = (authType: MCPAuthType) => ({ id: "srv", name: "Telegram", url: "", authType }) as unknown as MCPServer;

describe("MCP authentication", () => {
  beforeEach(() => localStorage.clear());

  it("treats Telegram as a sign-in, not a token to paste", () => {
    const telegram = server(MCPAuthType.TELEGRAM);
    expect(requiresAuth(telegram)).toBe(true);
    expect(requiresSignIn(telegram)).toBe(true);
    expect(requiresTokenEntry(telegram)).toBe(false);
    expect(requiresSignIn(server(MCPAuthType.BEARER))).toBe(false);
  });

  it("keeps a Telegram session with no expiry, replacing an expired token", () => {
    storeMcpToken("srv", "old", Date.now() - 1000, "u1");
    expect(hasValidMcpToken("srv", "u1")).toBe(false);

    storeMcpSession("srv", "telegram-session", "u1");

    expect(hasValidMcpToken("srv", "u1")).toBe(true);
    expect(getMcpAuthToken("srv", "u1")).toEqual({ accessToken: "telegram-session" });
  });

  it("sends the stored session with the chat's MCP tools", () => {
    storeMcpSession("srv", "telegram-session", "u1");
    expect(getChatMcpTokens([{ type: ToolType.MCP, id: "srv", name: "Telegram" }], "u1")).toEqual([
      { serverId: "srv", accessToken: "telegram-session" },
    ]);
  });

  it("has the Telegram sign-in texts in every language", () => {
    const keys = Object.keys(en.mcp.telegram).sort();
    for (const locale of [de, ru, zh]) {
      expect(Object.keys(locale.mcp.telegram).sort()).toEqual(keys);
    }
  });
});
