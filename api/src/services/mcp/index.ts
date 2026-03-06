import { handleGmailMCPRequest } from "./gmail";
import { Request, Response } from "express";

export type McpRequestHandler = (req: Request, res: Response, authToken: string) => Promise<void>;

export interface SystemMCPServerEntry {
  name: string;
  description: string;
  authorizationUrl: string;
  tokenUrl: string;
  scope: string;
  handler: McpRequestHandler;
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
};
