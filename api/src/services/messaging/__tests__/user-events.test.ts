import { userChatEventOf } from "../user-events";
import { MessageRole, ResponseStatus } from "@/types/api";

const payload = (message: Record<string, unknown>, streaming = false) =>
  ({
    chatId: "chat-1",
    data: {
      chat: { title: "Trip plan", modelId: "gpt", isPristine: false },
      streaming,
      message: {
        id: "m1",
        userId: "u1",
        role: MessageRole.ASSISTANT,
        status: ResponseStatus.COMPLETED,
        content: "Here is the plan.",
        ...message,
      },
    },
  }) as never;

describe("userChatEventOf", () => {
  it("reports a finished answer to its owner", () => {
    expect(userChatEventOf(payload({}), "u1")).toEqual({
      chatId: "chat-1",
      messageId: "m1",
      chatTitle: "Trip plan",
      kind: "completed",
      text: "Here is the plan.",
    });
  });

  it("reports failed answers as errors", () => {
    expect(userChatEventOf(payload({ role: MessageRole.ERROR, content: "Throttled" }), "u1")).toMatchObject({
      kind: "error",
      text: "Throttled",
    });
  });

  it("reports the latest tool call that waits for approval, even while streaming", () => {
    const event = userChatEventOf(
      payload(
        {
          status: ResponseStatus.TOOL_APPROVAL,
          metadata: {
            toolApprovals: [
              { callId: "c1", serverName: "Gmail", toolName: "read_email", status: "approved" },
              { callId: "c2", serverName: "Gmail", toolName: "send_email", status: "pending" },
            ],
          },
        },
        true
      ),
      "u1"
    );
    expect(event).toMatchObject({ kind: "approval", callId: "c2", text: "Gmail: send_email" });
  });

  it("ignores other users, streaming updates, user messages and parallel answers", () => {
    expect(userChatEventOf(payload({}), "u2")).toBeUndefined();
    expect(userChatEventOf(payload({}), undefined)).toBeUndefined();
    expect(userChatEventOf(payload({}, true), "u1")).toBeUndefined();
    expect(userChatEventOf(payload({ status: ResponseStatus.CANCELLED }), "u1")).toBeUndefined();
    expect(userChatEventOf(payload({ role: MessageRole.USER }), "u1")).toBeUndefined();
    expect(userChatEventOf(payload({ linkedToMessageId: "m0" }), "u1")).toBeUndefined();
    expect(userChatEventOf({ chatId: "chat-1", data: {} } as never, "u1")).toBeUndefined();
  });

  it("knows the owner from the user relation when the id column is not loaded", () => {
    expect(userChatEventOf(payload({ userId: undefined, user: { id: "u1" } }), "u1")).toMatchObject({
      kind: "completed",
    });
  });
});
