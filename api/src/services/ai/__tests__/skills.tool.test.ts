import { ApiProvider, ModelType, ToolType } from "../../../types/api";
import { CompleteChatRequest } from "../../../types/ai.types";

jest.mock("../tools/mcp.client", () => ({ MCPClient: { connect: jest.fn() } }));
jest.mock("../../../services/mcp.service", () => ({}));

import { callBedrockTool, formatBedrockRequestTools } from "../providers/bedrock.tools";

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
  });
});
