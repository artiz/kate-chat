import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Request, Response } from "express";
import { createLogger } from "@/utils/logger";
import { ok } from "@/utils/assert";
import { SystemMCPServerEntry } from "..";
import { describeTelegramError, forgetClient, getConnectedClient, isSessionError } from "./client";
import { callTool, TOOLS } from "./tools";

export { createTelegramAuthRouter } from "./auth";

const logger = createLogger(__filename);

function createTelegramServer(): Server {
  const server = new Server({ name: "Telegram", version: "1.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args = {} } = request.params;
    const session = extra.authInfo?.token;
    ok(session, "Telegram session is required: connect Telegram first");

    try {
      const client = await getConnectedClient(session);
      return await callTool(client, name, args);
    } catch (err) {
      if (isSessionError(err)) forgetClient(session);
      logger.warn({ tool: name, error: describeTelegramError(err) }, "Telegram tool call failed");
      return { isError: true, content: [{ type: "text" as const, text: describeTelegramError(err) }] };
    }
  });

  return server;
}

interface TelegramMcpSession {
  server: Server;
  transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, TelegramMcpSession>();

export async function handleTelegramMCPRequest(
  req: Request,
  res: Response,
  config: SystemMCPServerEntry,
  token: string
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session) {
    const server = createTelegramServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: id => {
        sessions.set(id, session!);
        logger.debug({ sessionId: id }, "Telegram MCP session initialized");
      },
      onsessionclosed: id => {
        sessions.delete(id);
      },
    });

    session = { server, transport };
    await server.connect(transport);
  }

  (req as any).auth = { token, clientId: "katechat", scopes: [config.scope || "katechat"] };
  await session.transport.handleRequest(req, res, req.body);
}
