import { Api, TelegramClient } from "telegram";
import { Dialog } from "telegram/tl/custom/dialog";
import { ok } from "@/utils/assert";

const MAX_TEXT = 4000;
const PREVIEW = 120;

const clamp = (value: unknown, fallback: number, max: number) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
};

const isoDate = (unixSeconds?: number) =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z") : "";

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

type Entity = Api.User | Api.Chat | Api.Channel | Api.TypeUser | Api.TypeChat | undefined;

function entityName(entity: Entity): string {
  if (!entity) return "Unknown";
  if (entity instanceof Api.User) {
    const name = [entity.firstName, entity.lastName].filter(Boolean).join(" ");
    return name || (entity.username ? `@${entity.username}` : `User ${entity.id}`);
  }
  if ("title" in entity && entity.title) return entity.title;
  return `Chat ${entity.id}`;
}

function mediaLabel(message: Api.Message): string {
  const media = message.media;
  if (!media) return "";
  if (media instanceof Api.MessageMediaPhoto) return "[photo]";
  if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    const attrs = media.document.attributes;
    if (attrs.some(a => a instanceof Api.DocumentAttributeAudio && a.voice)) return "[voice message]";
    if (attrs.some(a => a instanceof Api.DocumentAttributeVideo && a.roundMessage)) return "[video message]";
    if (attrs.some(a => a instanceof Api.DocumentAttributeSticker)) return "[sticker]";
    const file = attrs.find(a => a instanceof Api.DocumentAttributeFilename) as
      | Api.DocumentAttributeFilename
      | undefined;
    return file ? `[file: ${file.fileName}]` : "[file]";
  }
  if (media instanceof Api.MessageMediaGeo || media instanceof Api.MessageMediaGeoLive) return "[location]";
  if (media instanceof Api.MessageMediaContact) return "[contact]";
  if (media instanceof Api.MessageMediaPoll) return `[poll: ${media.poll.question.text}]`;
  if (media instanceof Api.MessageMediaWebPage) return "";
  return "[media]";
}

function messageText(message: Api.Message, max: number): string {
  const text = truncate((message.message || "").trim(), max);
  const media = mediaLabel(message);
  return [media, text].filter(Boolean).join(" ") || "[empty]";
}

export function formatMessage(message: Api.Message, max = MAX_TEXT): string {
  const from = message.out ? "Me" : entityName(message.sender as Entity);
  const reply = message.replyTo instanceof Api.MessageReplyHeader && message.replyTo.replyToMsgId;
  const replyNote = reply ? ` (reply to ${reply})` : "";
  return `[${message.id}] ${isoDate(message.date)} ${from}${replyNote}: ${messageText(message, max)}`;
}

function dialogKind(dialog: Dialog): string {
  if (dialog.isUser) return (dialog.entity as Api.User)?.bot ? "Bot" : "Private";
  if (dialog.isChannel && !dialog.isGroup) return "Channel";
  return "Group";
}

export function formatDialog(dialog: Dialog): string {
  const last = dialog.message;
  const preview = last
    ? ` | last ${isoDate(last.date)} ${last.out ? "Me" : entityName(last.sender as Entity)}: ${messageText(last, PREVIEW)}`
    : "";
  const unread = dialog.unreadCount ? ` | unread: ${dialog.unreadCount}` : "";
  return `ID: ${dialog.id} | ${dialogKind(dialog)}: ${dialog.title || dialog.name}${unread}${preview}`;
}

const DIALOG_SCAN_LIMIT = 200;

/**
 * Accepts what a model is likely to have: an ID from list_chats, an @username, a phone number, or
 * the chat's name. A fresh session knows no entities, so numeric IDs are only resolvable once the
 * dialog list has been read; names are matched against that list too.
 */
export async function resolveChat(client: TelegramClient, chat: string): Promise<Api.TypeInputPeer> {
  const value = chat.trim();
  ok(value, "chat is required");

  const numeric = /^-?\d+$/.test(value) ? Number(value) : undefined;
  const target = numeric !== undefined && Number.isSafeInteger(numeric) ? numeric : value;
  const isName = numeric === undefined && !value.startsWith("@") && !value.startsWith("+") && value !== "me";

  if (!isName) {
    try {
      return await client.getInputEntity(target);
    } catch {
      // not cached yet: fall through to reading the dialog list
    }
  }

  const dialogs = await client.getDialogs({ limit: DIALOG_SCAN_LIMIT });
  if (!isName) return client.getInputEntity(target);

  const needle = value.toLowerCase();
  const title = (d: Dialog) => (d.title || d.name || "").toLowerCase();
  const exact = dialogs.filter(d => title(d) === needle);
  const matches = exact.length ? exact : dialogs.filter(d => title(d).includes(needle));
  if (matches.length === 1) return matches[0].inputEntity;
  if (!matches.length) throw new Error(`No chat named "${value}". Use list_chats to find its ID.`);
  throw new Error(
    `"${value}" matches several chats, pass one of these IDs instead:\n${matches
      .slice(0, 10)
      .map(d => `${d.id} ${d.title || d.name}`)
      .join("\n")}`
  );
}

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

export const TOOLS = [
  {
    name: "list_chats",
    description:
      "List the user's Telegram chats (private chats, groups, channels, bots), most recent first, with unread counts and the last message.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum number of chats to return (1-100)", default: 20 },
        unreadOnly: { type: "boolean", description: "Only chats with unread messages", default: false },
        query: { type: "string", description: "Only chats whose name contains this text" },
      },
    },
  },
  {
    name: "get_messages",
    description:
      "Read messages from one Telegram chat, oldest first. Optionally search within the chat or page back with beforeMessageId.",
    inputSchema: {
      type: "object",
      properties: {
        chat: { type: "string", description: "Chat ID from list_chats, @username, phone number, or chat name" },
        limit: { type: "number", description: "Maximum number of messages (1-100)", default: 20 },
        query: { type: "string", description: "Only messages containing this text" },
        beforeMessageId: { type: "number", description: "Only messages older than this message ID" },
      },
      required: ["chat"],
    },
  },
  {
    name: "search_messages",
    description: "Search messages across all of the user's Telegram chats.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for" },
        limit: { type: "number", description: "Maximum number of messages (1-50)", default: 20 },
      },
      required: ["query"],
    },
  },
  {
    name: "send_message",
    description: "Send a text message from the user's Telegram account. The text is sent as is, without formatting.",
    inputSchema: {
      type: "object",
      properties: {
        chat: { type: "string", description: "Chat ID from list_chats, @username, phone number, or chat name" },
        text: { type: "string", description: "Message text" },
        replyToMessageId: { type: "number", description: "ID of the message to reply to" },
      },
      required: ["chat", "text"],
    },
  },
  {
    name: "mark_as_read",
    description: "Mark all messages in a Telegram chat as read.",
    inputSchema: {
      type: "object",
      properties: {
        chat: { type: "string", description: "Chat ID from list_chats, @username, phone number, or chat name" },
      },
      required: ["chat"],
    },
  },
];

export async function callTool(client: TelegramClient, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "list_chats": {
      const limit = clamp(args.limit, 20, 100);
      const unreadOnly = args.unreadOnly === true;
      const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
      const filtered = unreadOnly || query;

      const dialogs = await client.getDialogs({ limit: filtered ? DIALOG_SCAN_LIMIT : limit });
      const chats = dialogs
        .filter(d => !unreadOnly || d.unreadCount > 0)
        .filter(d => !query || (d.title || d.name || "").toLowerCase().includes(query))
        .slice(0, limit);

      if (!chats.length) return text(unreadOnly ? "No unread chats." : "No chats found.");
      return text(chats.map(formatDialog).join("\n"));
    }

    case "get_messages": {
      const peer = await resolveChat(client, String(args.chat ?? ""));
      const limit = clamp(args.limit, 20, 100);
      const search = typeof args.query === "string" && args.query.trim() ? args.query.trim() : undefined;
      const before = clamp(args.beforeMessageId, 0, Number.MAX_SAFE_INTEGER);

      const messages = await client.getMessages(peer, { limit, search, offsetId: before || undefined });
      if (!messages.length) return text(search ? `No messages matching "${search}".` : "No messages.");
      return text(
        [...messages]
          .reverse()
          .map(m => formatMessage(m))
          .join("\n")
      );
    }

    case "search_messages": {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      ok(query, "query is required");
      const limit = clamp(args.limit, 20, 50);

      const messages = await client.getMessages(undefined, { search: query, limit });
      if (!messages.length) return text(`No messages found for "${query}".`);
      return text(
        messages.map(m => `Chat ${m.chatId} (${entityName(m.chat as Entity)}): ${formatMessage(m, 500)}`).join("\n")
      );
    }

    case "send_message": {
      const message = typeof args.text === "string" ? args.text : "";
      ok(message.trim(), "text is required");
      const peer = await resolveChat(client, String(args.chat ?? ""));
      const replyTo = clamp(args.replyToMessageId, 0, Number.MAX_SAFE_INTEGER) || undefined;

      const sent = await client.sendMessage(peer, { message, replyTo, parseMode: false });
      return text(`Message sent (ID ${sent.id}) at ${isoDate(sent.date)}.`);
    }

    case "mark_as_read": {
      const peer = await resolveChat(client, String(args.chat ?? ""));
      await client.markAsRead(peer);
      return text("Marked as read.");
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
