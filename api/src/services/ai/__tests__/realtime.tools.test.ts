jest.mock("@/config/database", () => ({ getRepository: jest.fn(() => ({})) }));
const callTool = jest.fn(async (name: string) => ({
  content: [{ type: "text", text: `${name} done` }],
  isError: false,
}));
jest.mock("../tools/mcp.client", () => ({
  MCPClient: { connect: jest.fn(() => ({ callTool, close: jest.fn(async () => undefined) })) },
}));
const search = jest.fn(async () => [
  { title: "Rome", url: "https://example.com/rome", content: "Rome is the capital" },
]);
jest.mock("../tools/yandex.web_search", () => ({
  WEB_SEARCH_TOOL_NAME: "internal_web_search",
  YandexWebSearch: { search: (...args: unknown[]) => search(...(args as [])) },
}));

import { buildRealtimeTools, REALTIME_TOOL_OUTPUT_LIMIT, SEARCH_DOCUMENTS_TOOL_NAME } from "../tools/realtime.tools";
import { TOOL_CALL_UNAPPROVED } from "../tools/approval";
import { functionCallsOf, RealtimeService } from "../../realtime.service";
import { IMCPServer } from "@/types/ai.types";
import { ApiProvider, MCPAuthType, MCPTransportType, ToolType } from "@/types/api";

const server = (requireApproval = false): IMCPServer => ({
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

const base = {
  apiProvider: ApiProvider.OPEN_AI,
  modelId: "gpt-realtime",
  connection: { yandexSearchApiKey: "key", yandexSearchApiFolder: "folder" },
};

beforeEach(() => {
  callTool.mockClear();
  search.mockClear();
});

describe("buildRealtimeTools", () => {
  it("offers the chat's MCP tools, web search and its documents as function tools", () => {
    const { tools } = buildRealtimeTools({
      ...base,
      chatTools: [
        { type: ToolType.WEB_SEARCH, name: "Web search" },
        { type: ToolType.MCP, name: "Gmail", id: "srv-1" },
      ],
      mcpServers: [server()],
      documents: [{ id: "d1", name: "Contract.pdf" }],
      findChunks: async () => [],
    });

    expect(tools.map(tool => tool.name)).toEqual(["internal_web_search", "M_srv1_0", SEARCH_DOCUMENTS_TOOL_NAME]);
    expect(tools.every(tool => tool.type === "function" && tool.parameters)).toBe(true);
    expect(tools[1].description).toContain("send_email");
    expect(tools[2].description).toContain("Contract.pdf");
  });

  it("offers nothing the chat did not pick or cannot run", () => {
    expect(buildRealtimeTools({ ...base, chatTools: [] }).tools).toEqual([]);
    // web search without the Yandex search keys
    expect(
      buildRealtimeTools({ ...base, connection: {}, chatTools: [{ type: ToolType.WEB_SEARCH, name: "Web" }] }).tools
    ).toEqual([]);
    // an MCP server that was not loaded
    expect(buildRealtimeTools({ ...base, chatTools: [{ type: ToolType.MCP, name: "X", id: "other" }] }).tools).toEqual(
      []
    );
  });

  it("runs an MCP tool and returns its text", async () => {
    const set = buildRealtimeTools({
      ...base,
      chatTools: [{ type: ToolType.MCP, name: "Gmail", id: "srv-1" }],
      mcpServers: [server()],
      mcpTokens: [{ serverId: "srv-1", accessToken: "t" }],
    });

    await expect(set.call("M_srv1_0", '{"to":"a@b.c"}', "c1")).resolves.toBe("send_email done");
    expect(callTool).toHaveBeenCalledWith("send_email", { to: "a@b.c" });
  });

  it("declines tools of servers that ask first, unless the user turned approvals off", async () => {
    const chatTools = [{ type: ToolType.MCP, name: "Gmail", id: "srv-1" }];
    const asking = buildRealtimeTools({ ...base, chatTools, mcpServers: [server(true)] });
    await expect(asking.call("M_srv1_0", "{}", "c1")).resolves.toBe(TOOL_CALL_UNAPPROVED("send_email"));
    expect(callTool).not.toHaveBeenCalled();

    const off = buildRealtimeTools({ ...base, chatTools, mcpServers: [server(true)], mcpToolApprovals: false });
    await expect(off.call("M_srv1_0", "{}", "c1")).resolves.toBe("send_email done");
  });

  it("searches the chat's documents", async () => {
    const findChunks = jest.fn(async () => [
      { documentName: "Contract.pdf", page: 3, content: "The term is two years." },
    ]);
    const set = buildRealtimeTools({ ...base, documents: [{ id: "d1", name: "Contract.pdf" }], findChunks });

    await expect(set.call(SEARCH_DOCUMENTS_TOOL_NAME, '{"query":"term"}', "c1")).resolves.toBe(
      "[Contract.pdf, page 3]\nThe term is two years."
    );
    expect(findChunks).toHaveBeenCalledWith(["d1"], "term");
  });

  it("searches the web with the Yandex search keys", async () => {
    const set = buildRealtimeTools({ ...base, chatTools: [{ type: ToolType.WEB_SEARCH, name: "Web" }] });
    const output = await set.call("internal_web_search", '{"query":"capital of Italy"}', "c1");
    expect(output).toContain("Rome is the capital");
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ query: "capital of Italy" }), base.connection);
  });

  it("answers bad calls with an error the model can read, and keeps outputs short", async () => {
    const set = buildRealtimeTools({
      ...base,
      chatTools: [{ type: ToolType.MCP, name: "Gmail", id: "srv-1" }],
      mcpServers: [server()],
    });
    await expect(set.call("nope", "{}", "c1")).resolves.toContain('there is no tool "nope"');
    await expect(set.call("M_srv1_0", "{oops", "c1")).resolves.toContain("not valid JSON");

    callTool.mockResolvedValueOnce({ content: [{ type: "text", text: "x".repeat(50_000) }], isError: false });
    await expect(set.call("M_srv1_0", "{}", "c1")).resolves.toHaveLength(REALTIME_TOOL_OUTPUT_LIMIT);
  });
});

describe("functionCallsOf", () => {
  it("finds the function calls of a finished response", () => {
    const event = {
      type: "response.done",
      response: {
        output: [
          { type: "message", content: [] },
          { type: "function_call", call_id: "c1", name: "M_srv1_0", arguments: '{"to":"x"}' },
          { type: "function_call", call_id: "c2", name: "search_chat_documents" },
        ],
      },
    };
    expect(functionCallsOf(event)).toEqual([
      { call_id: "c1", name: "M_srv1_0", arguments: '{"to":"x"}' },
      { call_id: "c2", name: "search_chat_documents", arguments: "" },
    ]);
  });

  it("ignores other events", () => {
    expect(functionCallsOf({ type: "response.output_audio.delta" })).toEqual([]);
    expect(functionCallsOf({ type: "response.done", response: {} })).toEqual([]);
    expect(functionCallsOf(null)).toEqual([]);
  });
});

describe("the WebSocket proxy", () => {
  it("runs the calls of a finished response and asks the provider for a new one", async () => {
    const sent: unknown[] = [];
    const upstream = { readyState: 1, send: (text: string) => sent.push(JSON.parse(text)) };
    const loadTools = jest.fn(async () => ({
      tools: [],
      call: async (name: string, args: string) => `${name}(${args})`,
    }));
    const event = {
      type: "response.done",
      response: { output: [{ type: "function_call", call_id: "c1", name: "lookup", arguments: '{"q":1}' }] },
    };

    await (new RealtimeService() as any).handleFunctionCalls(JSON.stringify(event), upstream, loadTools);

    expect(sent).toEqual([
      {
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: "c1", output: 'lookup({"q":1})' },
      },
      { type: "response.create" },
    ]);
  });

  it("leaves other events to the browser", async () => {
    const upstream = { readyState: 1, send: jest.fn() };
    const loadTools = jest.fn();
    await (new RealtimeService() as any).handleFunctionCalls(
      JSON.stringify({ type: "response.function_call_arguments.delta" }),
      upstream,
      loadTools
    );
    expect(loadTools).not.toHaveBeenCalled();
    expect(upstream.send).not.toHaveBeenCalled();
  });
});
