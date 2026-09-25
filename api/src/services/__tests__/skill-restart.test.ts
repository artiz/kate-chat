/**
 * A model that writes a skill block without loading the skill (weak models skip use_skill) gets
 * its answer stopped and started again, once, with the skill's instructions and no output limit.
 */
const repository = () => ({
  find: jest.fn(async () => []),
  findOne: jest.fn(async () => null),
  save: jest.fn(async (entity: unknown) => entity),
});

jest.mock("@/config/database", () => ({ getRepository: jest.fn(() => repository()) }));
jest.mock("../ai/ai.service", () => ({
  AIService: jest.fn().mockImplementation(() => ({ streamChatCompletion: jest.fn() })),
}));
jest.mock("../ai/embeddings.service", () => ({ EmbeddingsService: jest.fn() }));
jest.mock("../mcp.service", () => ({ McpServersService: jest.fn() }));
jest.mock("../common/queue-lock.service", () => ({
  QueueLockService: jest.fn().mockImplementation(() => ({ putLock: jest.fn() })),
}));
jest.mock("../data", () => ({ S3Service: jest.fn() }));

import { MessagesService } from "../messages.service";
import { MessageRole, ModelType, ResponseStatus, ToolType } from "@/types/api";
import type { CompleteChatRequest, ModelResponse } from "@/types/ai.types";

type Stream = (data: ModelResponse & { error?: Error }, completed?: boolean) => Promise<boolean | undefined>;

/** A provider that streams the given tokens, stopping when the callback asks, then completes. */
const provider = (tokens: string[]) => async (request: CompleteChatRequest, callback: Stream) => {
  let content = "";
  for (const token of tokens) {
    content += token;
    if (await callback({ content: token })) break;
  }
  await callback({ content, metadata: {} }, true);
};

describe("an answer that starts a skill block without the skill", () => {
  it("is stopped and started again with the instructions and no output limit", async () => {
    const published: string[] = [];
    const subscriptions = {
      on: jest.fn(),
      publishChatMessage: jest.fn(async (_chat: unknown, message: { content: string }) => {
        published.push(message.content);
      }),
      publishChatError: jest.fn(),
    };
    const sqs = { subscribe: jest.fn(), isConfigured: () => false };
    const service = new MessagesService(subscriptions as never, sqs as never);
    const ai = (service as any).aiService.streamChatCompletion as jest.Mock;

    const requests: CompleteChatRequest[] = [];
    const first = provider([
      "I will make it.\n\n",
      "```typescript skill=pptx file=cv.pptx\n",
      "import pptx from",
      ' "pptxgenjs";\n',
    ]);
    const second = provider(["Here is your deck.\n\n", "```typescript skill=pptx file=cv.pptx\n", "// done\n", "```"]);
    ai.mockImplementation(async (_connection, request: CompleteChatRequest, _messages, _model, callback: Stream) => {
      requests.push(request);
      return (requests.length === 1 ? first : second)(request, callback);
    });

    const chat = { id: "chat-1", title: "CV", tools: [], settings: {} };
    const model = { modelId: "nova-lite", type: ModelType.CHAT, streaming: true, tools: [ToolType.MCP], features: [] };
    const user = { id: "u1", settings: { defaultMaxTokens: 2048 }, toToken: () => ({}) };
    const assistantMessage = { id: "m2", chatId: "chat-1", role: MessageRole.ASSISTANT, content: "", metadata: {} };
    (service as any).ensureChatTitle = jest.fn();
    (service as any).saveAndPublish = jest.fn(async (_chat: unknown, message: unknown) => message);
    (service as any).processModelResponse = jest.fn(async (message: { content: string }, data: ModelResponse) => {
      message.content = data.content || "";
    });

    await (service as any).publishAssistantMessage(
      { chatId: "chat-1", modelId: "nova-lite", content: "Make my CV deck" },
      {},
      user,
      model,
      chat,
      [{ role: MessageRole.USER, content: "Make my CV deck" }],
      assistantMessage
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(requests).toHaveLength(2);
    // first pass: catalog only, the chat's limit, stopped at the block's first line
    expect(requests[0].settings?.maxTokens).toBe(2048);
    expect(requests[0].settings?.systemPrompt).not.toContain("## Skill `pptx`");
    // second pass: the instructions, no limit
    expect(requests[1].settings?.maxTokens).toBeUndefined();
    expect(requests[1].settings?.systemPrompt).toContain("Your answer started a `pptx` block without loading");
    expect(requests[1].settings?.systemPrompt).toContain("## Skill `pptx`");
    expect(requests[1].settings?.systemPrompt).not.toContain("## Skill `office-edit`"); // no document to edit

    const saved = (service as any).saveAndPublish.mock.calls.map(([, message]: [unknown, any]) => message);
    expect(saved).toHaveLength(1); // only the second pass completes the message
    expect(saved[0].content).toBe("Here is your deck.\n\n```typescript skill=pptx file=cv.pptx\n// done\n```");
    expect(saved[0].status).toBe(ResponseStatus.COMPLETED);
    expect(saved[0].metadata.toolCalls).toEqual([
      { name: "use_skill", callId: "restart-pptx", args: '{"skill":"pptx"}' },
    ]);
  });

  it("is not restarted when the model loaded the skill first", async () => {
    const subscriptions = { on: jest.fn(), publishChatMessage: jest.fn(), publishChatError: jest.fn() };
    const service = new MessagesService(
      subscriptions as never,
      { subscribe: jest.fn(), isConfigured: () => false } as never
    );
    const ai = (service as any).aiService.streamChatCompletion as jest.Mock;
    ai.mockImplementation(async (_c, request: CompleteChatRequest, _m, _model, callback: Stream) => {
      await callback({
        content: "",
        status: {
          status: ResponseStatus.TOOL_CALL,
          toolCalls: [{ name: "use_skill", callId: "c1", args: '{"skill":"pptx"}' }],
        },
      } as never);
      await provider(["```typescript skill=pptx file=cv.pptx\n", "// ok\n", "```"])(request, callback);
    });
    (service as any).ensureChatTitle = jest.fn();
    (service as any).saveAndPublish = jest.fn(async (_chat: unknown, message: unknown) => message);
    (service as any).processModelResponse = jest.fn();

    await (service as any).publishAssistantMessage(
      { chatId: "chat-1", modelId: "nova-lite", content: "deck" },
      {},
      { id: "u1", settings: {}, toToken: () => ({}) },
      { modelId: "nova-lite", type: ModelType.CHAT, streaming: true, tools: [ToolType.MCP], features: [] },
      { id: "chat-1", tools: [], settings: {} },
      [],
      { id: "m3", chatId: "chat-1", role: MessageRole.ASSISTANT, content: "", metadata: {} }
    );
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(ai).toHaveBeenCalledTimes(1);
  });
});
