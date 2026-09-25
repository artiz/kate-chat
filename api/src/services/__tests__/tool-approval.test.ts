/**
 * A call of a tool from an MCP server with requireApproval waits in the answer until the user
 * approves or denies it, the answer is stopped, or the wait times out.
 */
const repository = () => ({
  find: jest.fn(async () => []),
  findOne: jest.fn(async () => null),
  save: jest.fn(async (entity: unknown) => entity),
});

jest.mock("@/config/database", () => ({ getRepository: jest.fn(() => repository()) }));
jest.mock("../ai/ai.service", () => ({
  AIService: jest.fn().mockImplementation(() => ({ streamChatCompletion: jest.fn(), stopRequest: jest.fn() })),
}));
jest.mock("../ai/embeddings.service", () => ({ EmbeddingsService: jest.fn() }));
jest.mock("../mcp.service", () => ({ McpServersService: jest.fn() }));
jest.mock("../common/queue-lock.service", () => ({
  QueueLockService: jest.fn().mockImplementation(() => ({ putLock: jest.fn(async () => undefined) })),
}));
jest.mock("../data", () => ({ S3Service: jest.fn() }));

import { MessagesService } from "../messages.service";
import { globalConfig } from "@/global-config";
import { MessageRole, ModelType, ResponseStatus } from "@/types/api";
import type { CompleteChatRequest, ModelResponse, ToolApprovalRequest } from "@/types/ai.types";

type Stream = (data: ModelResponse & { error?: Error }, completed?: boolean) => Promise<boolean | undefined>;

const CALL: ToolApprovalRequest = {
  callId: "call-1",
  serverId: "gmail",
  serverName: "Gmail",
  toolName: "send_email",
  args: { to: "boss@example.com" },
};

const tick = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

/** A service whose subscriptions pass tool approval events straight back, as Redis would */
function setup() {
  const handlers = new Map<string, (data: unknown) => void>();
  const subscriptions = {
    on: jest.fn((channel: string, handler: (data: unknown) => void) => handlers.set(channel, handler)),
    publishChatMessage: jest.fn(),
    publishChatError: jest.fn(),
    publishToolApproval: jest.fn(async (event: unknown) =>
      handlers.get(globalConfig.redis.channelToolApproval)?.(event)
    ),
  };
  const service = new MessagesService(
    subscriptions as never,
    { subscribe: jest.fn(), isConfigured: () => false } as never
  );
  const snapshots: any[] = [];
  (service as any).saveAndPublish = jest.fn(async (_chat: unknown, message: any) => {
    snapshots.push(JSON.parse(JSON.stringify(message)));
    return message;
  });
  const message: any = {
    id: "m1",
    chatId: "chat-1",
    userId: "u1",
    role: MessageRole.ASSISTANT,
    content: "",
    metadata: {},
  };
  // the database has what the service saved last
  (service as any).messageRepository.findOne = jest.fn(async () => JSON.parse(JSON.stringify(snapshots.at(-1))));
  return { service, subscriptions, snapshots, message, chat: { id: "chat-1" } };
}

describe("tool call approval", () => {
  it("shows the call, waits for the user and runs it once approved", async () => {
    const { service, subscriptions, snapshots, message, chat } = setup();

    const decision = (service as any).waitForToolApproval(chat, message, CALL);
    await tick();

    expect(snapshots[0].status).toBe(ResponseStatus.TOOL_APPROVAL);
    expect(snapshots[0].statusInfo).toBe("Gmail: send_email");
    expect(snapshots[0].metadata.toolApprovals).toEqual([
      {
        callId: "call-1",
        serverId: "gmail",
        serverName: "Gmail",
        toolName: "send_email",
        args: '{"to":"boss@example.com"}',
        status: "pending",
      },
    ]);

    await service.answerToolApproval("m1", "call-1", true, { id: "u1" } as never);
    await expect(decision).resolves.toBe(true);

    expect(subscriptions.publishToolApproval).toHaveBeenCalledWith({
      messageId: "m1",
      callId: "call-1",
      status: "approved",
    });
    const last = snapshots.at(-1);
    expect(last.status).toBe(ResponseStatus.MCP_CALL);
    expect(last.metadata.toolApprovals[0].status).toBe("approved");
  });

  it("does not run the call the user denied", async () => {
    const { service, message, chat } = setup();
    const decision = (service as any).waitForToolApproval(chat, message, CALL);
    await tick();

    await service.answerToolApproval("m1", "call-1", false, { id: "u1" } as never);
    await expect(decision).resolves.toBe(false);
    expect(message.metadata.toolApprovals[0].status).toBe("denied");
  });

  it("accepts answers from the owner of the answer only, and only while the call waits", async () => {
    const { service, subscriptions, message, chat } = setup();
    const decision = (service as any).waitForToolApproval(chat, message, CALL);
    await tick();

    await expect(service.answerToolApproval("m1", "call-1", true, { id: "intruder" } as never)).rejects.toThrow(
      "Message not found"
    );
    await expect(service.answerToolApproval("m1", "other-call", true, { id: "u1" } as never)).rejects.toThrow(
      "does not wait for approval"
    );

    await service.answerToolApproval("m1", "call-1", false, { id: "u1" } as never);
    await decision;
    // a second answer, from another tab, changes nothing
    await service.answerToolApproval("m1", "call-1", true, { id: "u1" } as never);
    expect(subscriptions.publishToolApproval).toHaveBeenCalledTimes(1);
  });

  it("declines the waiting calls of an answer that is stopped", async () => {
    const { service, message, chat } = setup();
    const decision = (service as any).waitForToolApproval(chat, message, CALL);
    await tick();

    // the stop arrives from another API instance as the cancelled message
    await (service as any).handleMessageEvent({ message: { id: "m1", status: ResponseStatus.CANCELLED } });
    await expect(decision).resolves.toBe(false);
  });

  it("counts a call nobody answers in time as declined", async () => {
    const { service, message, chat } = setup();
    const timeout = globalConfig.ai.toolApprovalTimeoutMs;
    globalConfig.ai.toolApprovalTimeoutMs = 20;
    try {
      await expect((service as any).waitForToolApproval(chat, message, CALL)).resolves.toBe(false);
      expect(message.metadata.toolApprovals[0].status).toBe("expired");
    } finally {
      globalConfig.ai.toolApprovalTimeoutMs = timeout;
    }
  });

  it("lets calls run without asking for a user who turned approvals off", async () => {
    const { service, snapshots, message } = setup();
    const ai = (service as any).aiService.streamChatCompletion as jest.Mock;
    const results: boolean[] = [];
    ai.mockImplementation(async (_c, request: CompleteChatRequest, _m, _model, callback: Stream) => {
      results.push(await request.approveToolCall!(CALL));
      await callback({ content: "sent", metadata: {} }, true);
    });
    (service as any).ensureChatTitle = jest.fn();
    (service as any).processModelResponse = jest.fn();

    await (service as any).publishAssistantMessage(
      { chatId: "chat-1", modelId: "gpt", content: "Mail my boss" },
      {},
      { id: "u1", settings: { mcpToolApprovals: false }, toToken: () => ({}) },
      { modelId: "gpt", type: ModelType.CHAT, streaming: true, tools: [], features: [] },
      { id: "chat-1", tools: [], settings: {} },
      [],
      message
    );
    await tick();

    expect(results).toEqual([true]);
    expect(snapshots.some(snapshot => snapshot.status === ResponseStatus.TOOL_APPROVAL)).toBe(false);
    expect(message.metadata.toolApprovals).toBeUndefined();
  });

  it("is offered to the provider of a streamed answer", async () => {
    const { service, message } = setup();
    const ai = (service as any).aiService.streamChatCompletion as jest.Mock;
    const results: boolean[] = [];
    ai.mockImplementation(async (_c, request: CompleteChatRequest, _m, _model, callback: Stream) => {
      results.push(await request.approveToolCall!(CALL));
      await callback({ content: "sent", metadata: {} }, true);
    });
    (service as any).ensureChatTitle = jest.fn();
    (service as any).processModelResponse = jest.fn();

    await (service as any).publishAssistantMessage(
      { chatId: "chat-1", modelId: "gpt", content: "Mail my boss" },
      {},
      { id: "u1", settings: {}, toToken: () => ({}) },
      { modelId: "gpt", type: ModelType.CHAT, streaming: true, tools: [], features: [] },
      { id: "chat-1", tools: [], settings: {} },
      [],
      message
    );
    await tick();
    await service.answerToolApproval("m1", "call-1", true, { id: "u1" } as never);
    await tick();

    expect(results).toEqual([true]);
  });
});
