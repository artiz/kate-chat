import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Request, Response } from "express";
import { createLogger } from "@/utils/logger";
import { ok } from "@/utils/assert";
import { SystemMCPServerEntry } from "..";

const logger = createLogger(__filename);

const GRAPH_API = "https://graph.microsoft.com/v1.0";

async function graphFetch(path: string, token: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${GRAPH_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft Graph API error ${res.status}: ${text}`);
  }

  return res.json();
}

const TOOLS = [
  {
    name: "list_chats",
    description: "List the user's Microsoft Teams chats",
    inputSchema: {
      type: "object",
      properties: {
        top: { type: "number", description: "Maximum number of chats to return (1-50)", default: 20 },
      },
    },
  },
  {
    name: "get_chat",
    description: "Get a specific Microsoft Teams chat by ID",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string", description: "Teams chat ID" },
      },
      required: ["chatId"],
    },
  },
  {
    name: "list_chat_messages",
    description: "List messages in a Microsoft Teams chat",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string", description: "Teams chat ID" },
        top: { type: "number", description: "Maximum number of messages to return (1-50)", default: 20 },
      },
      required: ["chatId"],
    },
  },
  {
    name: "post_chat_message",
    description: "Send a message to a Microsoft Teams chat",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string", description: "Teams chat ID" },
        message: { type: "string", description: "Message content (plain text)" },
      },
      required: ["chatId", "message"],
    },
  },
  {
    name: "create_chat",
    description:
      "Create a new Microsoft Teams chat. Use chatType 'oneOnOne' for two participants or 'group' for more than two.",
    inputSchema: {
      type: "object",
      properties: {
        chatType: {
          type: "string",
          enum: ["oneOnOne", "group"],
          description: "Type of chat: 'oneOnOne' (exactly 2 participants) or 'group' (more than 2)",
        },
        members: {
          type: "array",
          items: { type: "string" },
          description: "Array of user IDs (Azure AD object IDs) to add as members",
        },
        topic: { type: "string", description: "Optional topic for group chats" },
      },
      required: ["chatType", "members"],
    },
  },
  {
    name: "list_chat_members",
    description: "List members of a Microsoft Teams chat",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string", description: "Teams chat ID" },
      },
      required: ["chatId"],
    },
  },
  {
    name: "list_teams",
    description: "List the Microsoft Teams teams the current user has joined",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_team",
    description: "Get details of a specific Microsoft Teams team",
    inputSchema: {
      type: "object",
      properties: {
        teamId: { type: "string", description: "Teams team ID" },
      },
      required: ["teamId"],
    },
  },
  {
    name: "list_channels",
    description: "List channels in a Microsoft Teams team",
    inputSchema: {
      type: "object",
      properties: {
        teamId: { type: "string", description: "Teams team ID" },
      },
      required: ["teamId"],
    },
  },
  {
    name: "list_channel_messages",
    description: "List messages in a Microsoft Teams channel",
    inputSchema: {
      type: "object",
      properties: {
        teamId: { type: "string", description: "Teams team ID" },
        channelId: { type: "string", description: "Teams channel ID" },
        top: { type: "number", description: "Maximum number of messages to return (1-50)", default: 20 },
      },
      required: ["teamId", "channelId"],
    },
  },
  {
    name: "post_channel_message",
    description: "Post a message to a Microsoft Teams channel",
    inputSchema: {
      type: "object",
      properties: {
        teamId: { type: "string", description: "Teams team ID" },
        channelId: { type: "string", description: "Teams channel ID" },
        message: { type: "string", description: "Message content (plain text)" },
      },
      required: ["teamId", "channelId", "message"],
    },
  },
  {
    name: "reply_to_channel_message",
    description: "Reply to a message in a Microsoft Teams channel",
    inputSchema: {
      type: "object",
      properties: {
        teamId: { type: "string", description: "Teams team ID" },
        channelId: { type: "string", description: "Teams channel ID" },
        messageId: { type: "string", description: "ID of the message to reply to" },
        message: { type: "string", description: "Reply content (plain text)" },
      },
      required: ["teamId", "channelId", "messageId", "message"],
    },
  },
  {
    name: "list_channel_members",
    description: "List members of a Microsoft Teams channel",
    inputSchema: {
      type: "object",
      properties: {
        teamId: { type: "string", description: "Teams team ID" },
        channelId: { type: "string", description: "Teams channel ID" },
      },
      required: ["teamId", "channelId"],
    },
  },
];

function formatChatMessage(msg: any): string {
  const from = msg.from?.user?.displayName || msg.from?.application?.displayName || "Unknown";
  const date = msg.createdDateTime || "";
  const body = msg.body?.content || "(No content)";
  return `ID: ${msg.id}\nFrom: ${from}\nDate: ${date}\n${body}`;
}

function createTeamsServer(): Server {
  const server = new Server({ name: "Teams", version: "1.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const accessToken = extra.authInfo?.token;
    ok(accessToken, "Microsoft access token is required");
    const { name, arguments: args = {} } = request.params;

    switch (name) {
      case "list_chats": {
        const top = Math.min((args.top as number) || 20, 50);
        const params = new URLSearchParams({ $top: String(top) });
        const data = await graphFetch(`/chats?${params}`, accessToken);
        const chats: any[] = data.value || [];

        if (!chats.length) return { content: [{ type: "text", text: "No chats found." }] };

        const lines = chats.map(c => {
          const topic = c.topic ? ` — ${c.topic}` : "";
          return `ID: ${c.id}\nType: ${c.chatType}${topic}\nLast updated: ${c.lastUpdatedDateTime || "N/A"}`;
        });
        return { content: [{ type: "text", text: lines.join("\n\n---\n\n") }] };
      }

      case "get_chat": {
        const chatId = (args.chatId as string)?.trim();
        ok(chatId, "chatId is required");
        const chat = await graphFetch(`/chats/${encodeURIComponent(chatId)}`, accessToken);
        const topic = chat.topic ? `\nTopic: ${chat.topic}` : "";
        const text = `ID: ${chat.id}\nType: ${chat.chatType}${topic}\nCreated: ${chat.createdDateTime || "N/A"}\nLast updated: ${chat.lastUpdatedDateTime || "N/A"}`;
        return { content: [{ type: "text", text }] };
      }

      case "list_chat_messages": {
        const chatId = (args.chatId as string)?.trim();
        ok(chatId, "chatId is required");
        const top = Math.min((args.top as number) || 20, 50);
        const params = new URLSearchParams({ $top: String(top) });
        const data = await graphFetch(`/chats/${encodeURIComponent(chatId)}/messages?${params}`, accessToken);
        const messages: any[] = data.value || [];

        if (!messages.length) return { content: [{ type: "text", text: "No messages found in this chat." }] };

        const lines = messages.map(formatChatMessage);
        return { content: [{ type: "text", text: lines.join("\n\n---\n\n") }] };
      }

      case "post_chat_message": {
        const chatId = (args.chatId as string)?.trim();
        const message = (args.message as string)?.trim();
        ok(chatId, "chatId is required");
        ok(message, "message is required");

        await graphFetch(`/chats/${encodeURIComponent(chatId)}/messages`, accessToken, {
          method: "POST",
          body: JSON.stringify({ body: { content: message, contentType: "text" } }),
        });
        return { content: [{ type: "text", text: `Message sent to chat ${chatId}` }] };
      }

      case "create_chat": {
        const chatType = args.chatType as string;
        const memberIds = args.members as string[];
        const topic = args.topic as string | undefined;
        ok(chatType, "chatType is required");
        ok(memberIds?.length, "members array is required");

        const members = memberIds.map(userId => ({
          "@odata.type": "#microsoft.graph.aadUserConversationMember",
          roles: ["owner"],
          "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${userId}')`,
        }));

        const body: any = { chatType, members };
        if (topic && chatType === "group") body.topic = topic;

        const chat = await graphFetch("/chats", accessToken, {
          method: "POST",
          body: JSON.stringify(body),
        });
        return { content: [{ type: "text", text: `Chat created with ID: ${chat.id} (type: ${chat.chatType})` }] };
      }

      case "list_chat_members": {
        const chatId = (args.chatId as string)?.trim();
        ok(chatId, "chatId is required");

        const data = await graphFetch(`/chats/${encodeURIComponent(chatId)}/members`, accessToken);
        const members: any[] = data.value || [];

        if (!members.length) return { content: [{ type: "text", text: "No members found." }] };

        const lines = members.map(m => {
          const roles = m.roles?.length ? ` (${m.roles.join(", ")})` : "";
          return `${m.displayName || "Unknown"}${roles} — ${m.email || "no email"}`;
        });
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      case "list_teams": {
        const data = await graphFetch("/me/joinedTeams", accessToken);
        const teams: any[] = data.value || [];

        if (!teams.length) return { content: [{ type: "text", text: "No teams found." }] };

        const lines = teams.map(t => `ID: ${t.id}\nName: ${t.displayName}\nDescription: ${t.description || "(none)"}`);
        return { content: [{ type: "text", text: lines.join("\n\n---\n\n") }] };
      }

      case "get_team": {
        const teamId = (args.teamId as string)?.trim();
        ok(teamId, "teamId is required");

        const team = await graphFetch(`/teams/${encodeURIComponent(teamId)}`, accessToken);
        const text = `ID: ${team.id}\nName: ${team.displayName}\nDescription: ${team.description || "(none)"}\nVisibility: ${team.visibility || "N/A"}`;
        return { content: [{ type: "text", text }] };
      }

      case "list_channels": {
        const teamId = (args.teamId as string)?.trim();
        ok(teamId, "teamId is required");

        const data = await graphFetch(`/teams/${encodeURIComponent(teamId)}/allChannels`, accessToken);
        const channels: any[] = data.value || [];

        if (!channels.length) return { content: [{ type: "text", text: "No channels found." }] };

        const lines = channels.map(
          c =>
            `ID: ${c.id}\nName: ${c.displayName}\nType: ${c.membershipType || "standard"}\nDescription: ${c.description || "(none)"}`
        );
        return { content: [{ type: "text", text: lines.join("\n\n---\n\n") }] };
      }

      case "list_channel_messages": {
        const teamId = (args.teamId as string)?.trim();
        const channelId = (args.channelId as string)?.trim();
        ok(teamId, "teamId is required");
        ok(channelId, "channelId is required");
        const top = Math.min((args.top as number) || 20, 50);

        const params = new URLSearchParams({ $top: String(top) });
        const data = await graphFetch(
          `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages?${params}`,
          accessToken
        );
        const messages: any[] = data.value || [];

        if (!messages.length) return { content: [{ type: "text", text: "No messages found in this channel." }] };

        const lines = messages.map(formatChatMessage);
        return { content: [{ type: "text", text: lines.join("\n\n---\n\n") }] };
      }

      case "post_channel_message": {
        const teamId = (args.teamId as string)?.trim();
        const channelId = (args.channelId as string)?.trim();
        const message = (args.message as string)?.trim();
        ok(teamId, "teamId is required");
        ok(channelId, "channelId is required");
        ok(message, "message is required");

        await graphFetch(
          `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
          accessToken,
          { method: "POST", body: JSON.stringify({ body: { content: message, contentType: "text" } }) }
        );
        return { content: [{ type: "text", text: `Message posted to channel ${channelId}` }] };
      }

      case "reply_to_channel_message": {
        const teamId = (args.teamId as string)?.trim();
        const channelId = (args.channelId as string)?.trim();
        const messageId = (args.messageId as string)?.trim();
        const message = (args.message as string)?.trim();
        ok(teamId, "teamId is required");
        ok(channelId, "channelId is required");
        ok(messageId, "messageId is required");
        ok(message, "message is required");

        await graphFetch(
          `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/replies`,
          accessToken,
          { method: "POST", body: JSON.stringify({ body: { content: message, contentType: "text" } }) }
        );
        return {
          content: [{ type: "text", text: `Reply posted to message ${messageId} in channel ${channelId}` }],
        };
      }

      case "list_channel_members": {
        const teamId = (args.teamId as string)?.trim();
        const channelId = (args.channelId as string)?.trim();
        ok(teamId, "teamId is required");
        ok(channelId, "channelId is required");

        const data = await graphFetch(
          `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/members`,
          accessToken
        );
        const members: any[] = data.value || [];

        if (!members.length) return { content: [{ type: "text", text: "No members found." }] };

        const lines = members.map(m => {
          const roles = m.roles?.length ? ` (${m.roles.join(", ")})` : "";
          return `${m.displayName || "Unknown"}${roles} — ${m.email || "no email"}`;
        });
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}

// Session management
interface TeamsSession {
  server: Server;
  transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, TeamsSession>();

export async function handleTeamsMCPRequest(
  req: Request,
  res: Response,
  config: SystemMCPServerEntry,
  token: string
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session) {
    const server = createTeamsServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: id => {
        sessions.set(id, session!);
        logger.debug({ sessionId: id }, "Teams MCP session initialized");
      },
    });

    session = { server, transport };
    await server.connect(transport);
  }

  // Set auth on the request so the SDK passes it as extra.authInfo to handlers
  const clientId = process.env.MCP_SERVER_MICROSOFT_TEAMS_CLIENT_ID || "katechat";
  (req as any).auth = { token, clientId, scopes: [config.scope || "katechat"] };

  await session.transport.handleRequest(req, res, req.body);
}
