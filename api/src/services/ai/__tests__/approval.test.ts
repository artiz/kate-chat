const callTool = jest.fn(async () => ({ content: [{ type: "text", text: "sent" }], isError: false }));
jest.mock("../tools/mcp.client", () => ({
  MCPClient: { connect: jest.fn(() => ({ callTool, close: jest.fn(async () => undefined) })) },
}));

import { mcpCallRefusal, TOOL_CALL_DECLINED, TOOL_CALL_UNAPPROVED } from "../tools/approval";
import { formatOpenAIMcpTools } from "../protocols/openai.tools";
import { formatBedrockMcpTools } from "../providers/bedrock.tools";
import { CompleteChatRequest, IMCPServer } from "@/types/ai.types";
import { ApiProvider, MCPAuthType, MCPTransportType, ModelType, ToolType } from "@/types/api";

const server = (requireApproval: boolean): IMCPServer => ({
  id: "srv-1",
  name: "Gmail",
  url: "https://mcp.example.com",
  transportType: MCPTransportType.STREAMABLE_HTTP,
  authType: MCPAuthType.NONE,
  isActive: true,
  requireApproval,
  tools: [{ name: "send_email", description: "Send a mail", inputSchema: '{"type":"object"}' }],
  createdAt: new Date(),
  updatedAt: new Date(),
});

const request = (approve?: boolean): CompleteChatRequest => ({
  apiProvider: ApiProvider.OPEN_AI,
  modelId: "gpt",
  modelType: ModelType.CHAT,
  approveToolCall: approve === undefined ? undefined : jest.fn(async () => approve),
});

const MCP_TOOL = [{ type: ToolType.MCP, name: "Gmail", id: "srv-1" }];

beforeEach(() => callTool.mockClear());

describe("mcpCallRefusal", () => {
  it("lets calls of servers without requireApproval run without asking", async () => {
    const req = request(false);
    await expect(mcpCallRefusal(req, server(false), "send_email", {}, "c1")).resolves.toBeUndefined();
    expect(req.approveToolCall).not.toHaveBeenCalled();
  });

  it("asks the user with the call's details", async () => {
    const req = request(true);
    await expect(mcpCallRefusal(req, server(true), "send_email", { to: "a@b.c" }, "c1")).resolves.toBeUndefined();
    expect(req.approveToolCall).toHaveBeenCalledWith({
      callId: "c1",
      serverId: "srv-1",
      serverName: "Gmail",
      toolName: "send_email",
      args: { to: "a@b.c" },
    });
  });

  it("tells the model the user declined", async () => {
    await expect(mcpCallRefusal(request(false), server(true), "send_email", {}, "c1")).resolves.toBe(
      TOOL_CALL_DECLINED("send_email")
    );
  });

  it("refuses the call when nobody can approve it", async () => {
    await expect(mcpCallRefusal(request(), server(true), "send_email", {}, "c1")).resolves.toBe(
      TOOL_CALL_UNAPPROVED("send_email")
    );
    await expect(mcpCallRefusal(undefined, server(true), "send_email", {}, "c1")).resolves.toBe(
      TOOL_CALL_UNAPPROVED("send_email")
    );
  });
});

describe("MCP tools of a server that requires approval", () => {
  it("do not reach the server when the user denies the call (OpenAI)", async () => {
    const [tool] = formatOpenAIMcpTools(MCP_TOOL, [server(true)], request(false));
    const result = await tool.call({}, "c1", {} as never);

    expect(result).toEqual({ role: "tool", tool_call_id: "c1", content: TOOL_CALL_DECLINED("send_email") });
    expect(callTool).not.toHaveBeenCalled();
  });

  it("run once the user approves (OpenAI)", async () => {
    const [tool] = formatOpenAIMcpTools(MCP_TOOL, [server(true)], request(true));
    const result = await tool.call({ to: "a@b.c" }, "c1", {} as never);

    expect(result).toEqual({ role: "tool", tool_call_id: "c1", content: "sent" });
    expect(callTool).toHaveBeenCalledWith("send_email", { to: "a@b.c" });
  });

  it("do not reach the server when the user denies the call (Bedrock)", async () => {
    const [tool] = formatBedrockMcpTools(MCP_TOOL, [server(true)], request(false));
    const result = await tool.call({}, "c1", {} as never);

    expect(result).toEqual({ toolUseId: "c1", content: [{ text: TOOL_CALL_DECLINED("send_email") }], status: "error" });
    expect(callTool).not.toHaveBeenCalled();
  });

  it("run once the user approves (Bedrock)", async () => {
    const [tool] = formatBedrockMcpTools(MCP_TOOL, [server(true)], request(true));
    const result = await tool.call({}, "c1", {} as never);

    expect(result.content).toEqual([{ text: "sent" }]);
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});
