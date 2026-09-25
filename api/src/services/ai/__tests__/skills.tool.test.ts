import { ApiProvider, ModelType, ToolType } from "../../../types/api";
import { CompleteChatRequest } from "../../../types/ai.types";

jest.mock("../tools/mcp.client", () => ({ MCPClient: { connect: jest.fn() } }));
jest.mock("../../../services/mcp.service", () => ({}));

import { callBedrockTool, formatBedrockRequestTools } from "../providers/bedrock.tools";
import { outputLimitFromError } from "../../../config/ai/bedrock";
import { BedrockApiProvider } from "../providers/bedrock.provider";
import { MessageRole } from "../../../types/api";

describe("use_skill on Bedrock", () => {
  const request = (): CompleteChatRequest => ({
    apiProvider: ApiProvider.AWS_BEDROCK,
    modelId: "amazon.nova-lite-v1:0",
    modelType: ModelType.CHAT,
    settings: { maxTokens: 2048 },
    skills: { skills: [{ id: "pptx", name: "PowerPoint presentation" }], load: async id => `Instructions for ${id}` },
  });

  it("is offered even when the chat has no tools of its own, and only with skills", () => {
    const tools = formatBedrockRequestTools(undefined, undefined, request());
    expect(tools.map(tool => tool.toolSpec?.name)).toEqual(["use_skill"]);
    expect(tools[0].toolSpec?.inputSchema?.json).toMatchObject({ properties: { skill: { enum: ["pptx"] } } });

    const withoutSkills = { ...request(), skills: undefined };
    expect(formatBedrockRequestTools(undefined, undefined, withoutSkills)).toEqual([]);
    expect(
      formatBedrockRequestTools([{ type: ToolType.WEB_SEARCH, name: "web" }], undefined, request()).map(t => t.name)
    ).toEqual(["use_skill", "internal_web_search"]);
  });

  it("returns the instructions and lifts the output limit", async () => {
    const req = request();
    const tools = formatBedrockRequestTools(undefined, undefined, req);
    const result = await callBedrockTool(
      { name: "use_skill", toolUseId: "t1", input: { skill: "pptx" } },
      {} as never,
      tools
    );
    expect(result).toEqual({ toolUseId: "t1", content: [{ text: "Instructions for pptx" }] });
    expect(req.settings?.maxTokens).toBeUndefined();
    expect(req.outputUnlimited).toBe(true); // Bedrock then asks for the model's maximum explicitly
  });
});

describe("the output limit a Bedrock model names when it rejects a larger one", () => {
  it("reads it from Anthropic's and Nova's messages", () => {
    expect(
      outputLimitFromError(
        new Error("max_tokens: 64000 > 32000, which is the maximum allowed number of output tokens for claude-opus-4"),
        64000
      )
    ).toBe(32000);
    expect(
      outputLimitFromError(new Error("The maximum tokens you requested exceeds the model limit of 10000"), 64000)
    ).toBe(10000);
  });

  it("ignores other errors", () => {
    expect(
      outputLimitFromError(new Error("Too many requests, please wait before trying again."), 64000)
    ).toBeUndefined();
    expect(outputLimitFromError(new Error("Input is too long for requested model"), 64000)).toBeUndefined();
    expect(outputLimitFromError(new Error("max_tokens: 64000 is fine"), 64000)).toBeUndefined();
  });
});

describe("an unlimited answer on Bedrock", () => {
  it("asks for the maximum explicitly and retries with the limit the model names", async () => {
    const provider = new BedrockApiProvider({} as never);
    const send = jest
      .fn()
      .mockRejectedValueOnce(
        new Error("max_tokens: 64000 > 32000, which is the maximum allowed number of output tokens for claude-x")
      )
      .mockResolvedValue({
        output: { message: { role: "assistant", content: [{ text: "Done" }] } },
        stopReason: "end_turn",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      });
    (provider as any).bedrockClient = { send };

    const request: CompleteChatRequest = {
      apiProvider: ApiProvider.AWS_BEDROCK,
      modelId: "anthropic.claude-x-v1:0",
      modelType: ModelType.CHAT,
      settings: {},
      outputUnlimited: true,
    };
    const response = await provider.completeChat(request, [{ role: MessageRole.USER, body: "Make the deck" }]);

    expect(response.content).toBe("Done");
    expect(send.mock.calls.map(([command]) => command.input.inferenceConfig.maxTokens)).toEqual([64000, 32000]);

    // remembered: the next unlimited answer asks for 32000 straight away
    await provider.completeChat(request, [{ role: MessageRole.USER, body: "Again" }]);
    expect(send.mock.calls[2][0].input.inferenceConfig.maxTokens).toBe(32000);

    // an answer with the chat's limit is left alone
    await provider.completeChat({ ...request, outputUnlimited: false, settings: { maxTokens: 2048 } }, [
      { role: MessageRole.USER, body: "Hi" },
    ]);
    expect(send.mock.calls[3][0].input.inferenceConfig.maxTokens).toBe(2048);
  });
});
