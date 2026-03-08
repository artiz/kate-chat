import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Request, Response } from "express";
import { createLogger } from "@/utils/logger";
import { ok } from "@/utils/assert";
import { SystemMCPServerEntry } from "..";

const logger = createLogger(__filename);

const GMAIL_API = "https://www.googleapis.com/gmail/v1";

async function gmailFetch(path: string, token: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${text}`);
  }

  return res.json();
}

function extractBody(payload: any): string {
  if (!payload) return "";

  const findPart = (parts: any[], mimeType: string): string | null => {
    for (const part of parts || []) {
      if (part.mimeType === mimeType && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
      if (part.parts) {
        const nested = findPart(part.parts, mimeType);
        if (nested) return nested;
      }
    }
    return null;
  };

  if (payload.parts) {
    return findPart(payload.parts, "text/plain") || findPart(payload.parts, "text/html") || "(No body)";
  }
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  return "(No body)";
}

const TOOLS = [
  {
    name: "list_emails",
    description: "List emails from Gmail",
    inputSchema: {
      type: "object",
      properties: {
        maxResults: { type: "number", description: "Maximum number of emails to return (1-100)", default: 10 },
        labelIds: {
          type: "array",
          items: { type: "string" },
          description: "Label IDs to filter by (e.g., INBOX, SENT, DRAFT, SPAM)",
          default: ["INBOX"],
        },
        query: { type: "string", description: "Optional Gmail search query" },
      },
    },
  },
  {
    name: "get_email",
    description: "Get the full content of an email by ID",
    inputSchema: {
      type: "object",
      properties: {
        emailId: { type: "string", description: "Gmail message ID" },
      },
      required: ["emailId"],
    },
  },
  {
    name: "search_emails",
    description: "Search emails using Gmail search syntax",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Gmail search query (e.g., 'from:user@example.com subject:hello is:unread')",
        },
        maxResults: { type: "number", description: "Maximum results (1-50)", default: 10 },
      },
      required: ["query"],
    },
  },
  {
    name: "send_email",
    description: "Send an email via Gmail",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body (plain text)" },
        cc: { type: "string", description: "CC recipients (comma-separated)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "create_draft",
    description: "Create an email draft in Gmail",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body (plain text)" },
        cc: { type: "string", description: "CC recipients (comma-separated)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "list_labels",
    description: "List all Gmail labels",
    inputSchema: { type: "object", properties: {} },
  },
];

function createGmailServer(): Server {
  const server = new Server({ name: "Gmail", version: "1.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args = {} } = request.params;
    const accessToken = extra.authInfo?.token;
    ok(accessToken, "Google API access token is required");

    switch (name) {
      case "list_emails": {
        const maxResults = (args.maxResults as number) || 10;
        const labelIds: string[] = (args.labelIds as string[]) || ["INBOX"];
        const query = args.query as string | undefined;

        const params = new URLSearchParams({ maxResults: String(maxResults) });
        for (const id of labelIds) params.append("labelIds", id);
        if (query) params.set("q", query);

        const data = await gmailFetch(`/users/me/messages?${params}`, accessToken);
        const messages: { id: string }[] = data.messages || [];

        if (!messages.length) return { content: [{ type: "text", text: "No emails found." }] };

        const details = await Promise.all(
          messages.map(async m => {
            const msg = await gmailFetch(
              `/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
              accessToken
            );

            const hdrs: { name: string; value: string }[] = msg.payload?.headers || [];
            const get = (n: string) => hdrs.find(h => h.name === n)?.value || "";
            const snippet = msg.snippet ? `\nSnippet: ${msg.snippet}` : "";
            return `ID: ${m.id}\nFrom: ${get("From")}\nDate: ${get("Date")}\nSubject: ${get("Subject")}${snippet}`;
          })
        );
        return { content: [{ type: "text", text: details.join("\n\n---\n\n") }] };
      }

      case "get_email": {
        const emailId = (args.emailId as string)?.trim();
        ok(emailId, "emailId is required");

        const msg = await gmailFetch(`/users/me/messages/${emailId}?format=full`, accessToken);
        const hdrs: { name: string; value: string }[] = msg.payload?.headers || [];
        const get = (n: string) => hdrs.find(h => h.name === n)?.value || "";
        const body = extractBody(msg.payload);
        const text = `From: ${get("From")}\nTo: ${get("To")}\nDate: ${get("Date")}\nSubject: ${get("Subject")}\n\n${body}`;
        return { content: [{ type: "text", text }] };
      }

      case "search_emails": {
        const query = args.query as string;
        const maxResults = (args.maxResults as number) || 10;
        const data = await gmailFetch(
          `/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
          accessToken
        );
        const messages: { id: string }[] = data.messages || [];

        if (!messages.length) return { content: [{ type: "text", text: `No emails found for query: "${query}"` }] };

        const details = await Promise.all(
          messages.map(async m => {
            const msg = await gmailFetch(
              `/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
              accessToken
            );
            const hdrs: { name: string; value: string }[] = msg.payload?.headers || [];
            const get = (n: string) => hdrs.find(h => h.name === n)?.value || "";
            return `ID: ${m.id}\nFrom: ${get("From")}\nDate: ${get("Date")}\nSubject: ${get("Subject")}`;
          })
        );
        return { content: [{ type: "text", text: details.join("\n\n---\n\n") }] };
      }

      case "send_email": {
        const { to, subject, body, cc } = args as Record<string, string>;
        const headerLines = [
          `To: ${to}`,
          `Subject: ${subject}`,
          cc ? `Cc: ${cc}` : null,
          "Content-Type: text/plain; charset=UTF-8",
          "MIME-Version: 1.0",
        ]
          .filter(Boolean)
          .join("\r\n");
        const raw = Buffer.from(`${headerLines}\r\n\r\n${body}`).toString("base64url");
        await gmailFetch(`/users/me/messages/send`, accessToken, { method: "POST", body: JSON.stringify({ raw }) });
        return { content: [{ type: "text", text: `Email sent to ${to} with subject: "${subject}"` }] };
      }

      case "create_draft": {
        const { to, subject, body, cc } = args as Record<string, string>;
        const headerLines = [
          `To: ${to}`,
          `Subject: ${subject}`,
          cc ? `Cc: ${cc}` : null,
          "Content-Type: text/plain; charset=UTF-8",
          "MIME-Version: 1.0",
        ]
          .filter(Boolean)
          .join("\r\n");
        const raw = Buffer.from(`${headerLines}\r\n\r\n${body}`).toString("base64url");
        const draft = await gmailFetch(`/users/me/drafts`, accessToken, {
          method: "POST",
          body: JSON.stringify({ message: { raw } }),
        });
        return { content: [{ type: "text", text: `Draft created with ID: ${draft.id}` }] };
      }

      case "list_labels": {
        const data = await gmailFetch(`/users/me/labels`, accessToken);
        const labels: { id: string; name: string; type: string }[] = data.labels || [];
        const text = labels.map(l => `${l.name} (ID: ${l.id}, type: ${l.type})`).join("\n");
        return { content: [{ type: "text", text: text || "No labels found." }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}

// Session management
interface GmailSession {
  server: Server;
  transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, GmailSession>();

export async function handleGmailMCPRequest(
  req: Request,
  res: Response,
  config: SystemMCPServerEntry,
  token: string
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session) {
    const server = createGmailServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: id => {
        sessions.set(id, session!);
        logger.debug({ sessionId: id }, "Gmail MCP session initialized");
      },
    });

    session = { server, transport };
    await server.connect(transport);
  }

  // Set auth on the request so the SDK passes it as extra.authInfo to handlers
  const clientId = process.env.MCP_SERVER_GMAIL_CLIENT_ID || "katechat";
  (req as any).auth = { token, clientId, scopes: [config.scope || "katechat"] };

  await session.transport.handleRequest(req, res, req.body);
}
