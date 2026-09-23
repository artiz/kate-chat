import { handleGmailMCPRequest } from "./gmail";
import { handleTeamsMCPRequest } from "./microsoft_teams";
import { createTelegramAuthRouter, handleTelegramMCPRequest } from "./telegram";
import { Request, Response, Router } from "express";
import { MCPAuthType } from "@/types/api";

export type McpRequestHandler = (
  req: Request,
  res: Response,
  config: SystemMCPServerEntry,
  authToken: string
) => Promise<void>;

export interface SystemMCPServerEntry {
  name: string;
  description: string;
  /** How the browser obtains the token every request carries. OAUTH2 when not set. */
  authType?: MCPAuthType;
  authorizationUrl?: string;
  tokenUrl?: string;
  scope?: string;
  handler: McpRequestHandler;
  /** Routes a login flow other than OAuth needs, mounted at /mcp/<name>/auth. */
  authRouter?: () => Router;
}

export const MCP_SERVERS: Record<string, SystemMCPServerEntry> = {
  gmail: {
    name: "Gmail",
    description: "Access your Gmail inbox: read, search, and send emails.",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope:
      "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
    handler: handleGmailMCPRequest,
  },
  microsoft_teams: {
    name: "Microsoft Teams",
    description: "Access Microsoft Teams: chats, channels, messages, and team management.",
    authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope:
      "https://graph.microsoft.com/Chat.ReadWrite https://graph.microsoft.com/Channel.ReadBasic.All https://graph.microsoft.com/ChannelMessage.Read.All https://graph.microsoft.com/ChannelMessage.Send https://graph.microsoft.com/Team.ReadBasic.All https://graph.microsoft.com/TeamMember.Read.All https://graph.microsoft.com/User.Read offline_access",
    handler: handleTeamsMCPRequest,
  },
  telegram: {
    name: "Telegram",
    description: "Access your Telegram account: read, search, and send messages in your chats.",
    authType: MCPAuthType.TELEGRAM,
    handler: handleTelegramMCPRequest,
    authRouter: createTelegramAuthRouter,
  },
};
