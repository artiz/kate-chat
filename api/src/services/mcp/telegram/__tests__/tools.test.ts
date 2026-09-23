import { Api, helpers, TelegramClient } from "teleproto";
import { Dialog } from "teleproto/tl/custom/dialog";
import { installMessageBehaviour } from "teleproto/tl/custom/message";
import { callTool, formatDialog, formatMessage, resolveChat, TOOLS } from "../tools";

const big = helpers.returnBigInt;

// teleproto gives Api.Message its sender/chat getters when the first TelegramClient is built. The
// tools only ever see messages from a real client; here there is none, so install them directly.
installMessageBehaviour();

const anna = new Api.User({ id: big(7), firstName: "Anna", lastName: "K" });

const message = (fields: Partial<Api.Message> & { id: number }, sender?: Api.User) => {
  const m = new Api.Message({
    date: 1790000000,
    message: "",
    peerId: new Api.PeerUser({ userId: big(7) }),
    ...fields,
  } as ConstructorParameters<typeof Api.Message>[0]);
  (m as unknown as { _sender?: Api.User })._sender = sender;
  return m;
};

const dialog = (id: number, title: string, extra: Partial<Dialog> = {}) =>
  ({
    id: big(id),
    title,
    name: title,
    unreadCount: 0,
    isUser: false,
    isGroup: true,
    isChannel: false,
    inputEntity: new Api.InputPeerChat({ chatId: big(Math.abs(id)) }),
    ...extra,
  }) as unknown as Dialog;

const fakeClient = (dialogs: Dialog[], known: Record<string, Api.TypeInputPeer> = {}) => {
  const client = {
    getInputEntity: jest.fn(async (target: string | number) => {
      const peer = known[String(target)];
      if (!peer) throw new Error(`Could not find the input entity for ${target}`);
      return peer;
    }),
    getDialogs: jest.fn(async () => dialogs),
    getMessages: jest.fn(async () => [] as Api.Message[]),
    sendMessage: jest.fn(async () => message({ id: 99, date: 1790000100 })),
    markAsRead: jest.fn(async () => true),
  };
  return client as typeof client & TelegramClient;
};

describe("telegram tools", () => {
  it("declares the tools the MCP server lists", () => {
    expect(TOOLS.map(t => t.name)).toEqual([
      "list_chats",
      "get_messages",
      "search_messages",
      "send_message",
      "mark_as_read",
    ]);
  });

  describe("formatMessage", () => {
    it("shows id, UTC time, sender and text", () => {
      expect(formatMessage(message({ id: 5, message: "hello" }, anna))).toBe("[5] 2026-09-21T14:13:20Z Anna K: hello");
    });

    it("names the user's own messages Me and keeps the reply reference", () => {
      const m = message({ id: 6, out: true, message: "ok", replyTo: new Api.MessageReplyHeader({ replyToMsgId: 5 }) });
      expect(formatMessage(m)).toBe("[6] 2026-09-21T14:13:20Z Me (reply to 5): ok");
    });

    it("labels media that carries no text", () => {
      expect(formatMessage(message({ id: 7, media: new Api.MessageMediaPhoto({}) }, anna))).toContain(": [photo]");
    });
  });

  it("formats a dialog with kind, unread count and last message", () => {
    const d = dialog(-100123, "Team", {
      unreadCount: 3,
      message: message({ id: 1, message: "standup at 10" }, anna),
    } as Partial<Dialog>);
    expect(formatDialog(d)).toBe(
      "ID: -100123 | Group: Team | unread: 3 | last 2026-09-21T14:13:20Z Anna K: standup at 10"
    );
  });

  describe("resolveChat", () => {
    const team = dialog(-100123, "Team");
    const family = dialog(-200, "Family");
    const familyWork = dialog(-300, "Family business");

    it("resolves a numeric ID once the dialog list has filled the entity cache", async () => {
      const peer = new Api.InputPeerChannel({ channelId: big(123), accessHash: big(1) });
      const client = fakeClient([team]);
      client.getInputEntity
        .mockRejectedValueOnce(new Error("not cached"))
        .mockResolvedValueOnce(peer as unknown as never);

      await expect(resolveChat(client, "-100123")).resolves.toBe(peer);
      expect(client.getInputEntity).toHaveBeenLastCalledWith(-100123);
      expect(client.getDialogs).toHaveBeenCalledTimes(1);
    });

    it("does not read dialogs for an entity that is already known", async () => {
      const peer = new Api.InputPeerUser({ userId: big(7), accessHash: big(1) });
      const client = fakeClient([], { "@anna": peer });
      await expect(resolveChat(client, "@anna")).resolves.toBe(peer);
      expect(client.getDialogs).not.toHaveBeenCalled();
    });

    it("prefers an exact name over partial matches", async () => {
      const client = fakeClient([team, family, familyWork]);
      await expect(resolveChat(client, "family")).resolves.toBe(family.inputEntity);
    });

    it("accepts a unique partial name", async () => {
      const client = fakeClient([team, family, familyWork]);
      await expect(resolveChat(client, "busi")).resolves.toBe(familyWork.inputEntity);
    });

    it("lists the candidates when a name is ambiguous", async () => {
      const client = fakeClient([dialog(-1, "Anna"), dialog(-2, "anna")]);
      await expect(resolveChat(client, "ann")).rejects.toThrow(/matches several chats[\s\S]*-1 Anna[\s\S]*-2 anna/);
    });

    it("points to list_chats when nothing matches", async () => {
      const client = fakeClient([team]);
      await expect(resolveChat(client, "Nobody")).rejects.toThrow('No chat named "Nobody". Use list_chats');
    });
  });

  describe("callTool", () => {
    it("filters list_chats to unread ones and scans past the limit to find them", async () => {
      const client = fakeClient([dialog(-1, "Quiet"), dialog(-2, "Busy", { unreadCount: 2 } as Partial<Dialog>)]);
      const result = await callTool(client, "list_chats", { unreadOnly: true, limit: 5 });
      expect(client.getDialogs).toHaveBeenCalledWith({ limit: 200 });
      expect(result.content[0].text).toBe("ID: -2 | Group: Busy | unread: 2");
    });

    it("returns messages oldest first", async () => {
      const client = fakeClient([], { "@anna": new Api.InputPeerSelf() });
      client.getMessages.mockResolvedValueOnce([
        message({ id: 2, date: 1790000060, message: "second" }, anna),
        message({ id: 1, date: 1790000000, message: "first" }, anna),
      ]);
      const result = await callTool(client, "get_messages", { chat: "@anna", limit: 2 });
      expect(result.content[0].text.split("\n").map(l => l.slice(0, 3))).toEqual(["[1]", "[2]"]);
    });

    it("sends plain text so the model's markdown arrives as written", async () => {
      const peer = new Api.InputPeerSelf();
      const client = fakeClient([], { "@anna": peer });
      await callTool(client, "send_message", { chat: "@anna", text: "**hi**", replyToMessageId: 5 });
      expect(client.sendMessage).toHaveBeenCalledWith(peer, { message: "**hi**", replyTo: 5, parseMode: false });
    });

    it("refuses an empty message before touching Telegram", async () => {
      const client = fakeClient([]);
      await expect(callTool(client, "send_message", { chat: "@anna", text: "  " })).rejects.toThrow("text is required");
      expect(client.sendMessage).not.toHaveBeenCalled();
    });
  });
});
