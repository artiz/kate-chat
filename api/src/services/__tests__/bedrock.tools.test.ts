import {
  BedrockToolCall,
  BedrockToolCallable,
  WEB_SEARCH_TOOL,
  parseToolUse,
  callBedrockTool,
  formatBedrockMcpTools,
  formatBedrockRequestTools,
} from "../ai/providers/bedrock.tools";
import { ToolUseBlock } from "@aws-sdk/client-bedrock-runtime";
import { MCPAuthType, MCPTransportType, ResponseStatus, ToolType } from "../../types/api";
import { MCPServer } from "../../entities";

// Mock the MCP client
jest.mock("../ai/tools/mcp.client", () => ({
  MCPClient: {
    connect: jest.fn(() => ({
      callTool: jest.fn().mockResolvedValue({
        content: [{ type: "text", text: "MCP tool result" }],
        isError: false,
      }),
      close: jest.fn().mockResolvedValue(undefined),
    })),
  },
}));

// Mock the YandexWebSearch
jest.mock("../ai/tools/yandex.web_search", () => ({
  WEB_SEARCH_TOOL_NAME: "web_search",
  YandexWebSearch: {
    search: jest.fn().mockResolvedValue([
      {
        title: "Test Result",
        url: "https://example.com",
        snippet: "Test snippet",
        content: "Test content",
      },
    ]),
  },
}));

describe("Bedrock Tools", () => {
  describe("WEB_SEARCH_TOOL", () => {
    it("should have correct configuration", () => {
      expect(WEB_SEARCH_TOOL.name).toBe("web_search");
      expect(WEB_SEARCH_TOOL.status).toBe(ResponseStatus.WEB_SEARCH);
      expect(WEB_SEARCH_TOOL.toolSpec?.name).toBe("web_search");
      expect(WEB_SEARCH_TOOL.toolSpec?.description).toBeDefined();
    });

    it("should return error for missing query", async () => {
      const result = await WEB_SEARCH_TOOL.call({}, "test-id", {} as any);
      expect(result.toolUseId).toBe("test-id");
      expect(result.status).toBe("error");
      expect(result.content?.[0]).toHaveProperty("text");
      expect((result.content?.[0] as any).text).toContain("Invalid 'query' argument");
    });

    it("should execute search with valid query", async () => {
      const result = await WEB_SEARCH_TOOL.call({ query: "test search" }, "test-id", {} as any);
      expect(result.toolUseId).toBe("test-id");
      expect(result.status).toBeUndefined(); // success
    });
  });

  describe("parseToolUse", () => {
    const mockTools: BedrockToolCallable[] = [
      {
        name: "web_search",
        toolSpec: { name: "web_search" },
        call: jest.fn(),
      } as unknown as BedrockToolCallable,
      {
        name: "M_abc123_0",
        mcpToolName: "original_tool",
        toolSpec: { name: "M_abc123_0" },
        call: jest.fn(),
      } as unknown as BedrockToolCallable,
    ];

    it("should parse a valid web search tool use", () => {
      const toolUse: ToolUseBlock = {
        toolUseId: "tool-123",
        name: "web_search",
        input: { query: "test query" },
      };

      const result = parseToolUse(toolUse, mockTools);

      expect(result.toolUseId).toBe("tool-123");
      expect(result.name).toBe("web_search");
      expect(result.input).toEqual({ query: "test query" });
      expect(result.error).toBeUndefined();
    });

    it("should parse an MCP tool use", () => {
      const toolUse: ToolUseBlock = {
        toolUseId: "mcp-tool-456",
        name: "M_abc123_0",
        input: { param: "value" },
      };

      const result = parseToolUse(toolUse, mockTools);

      expect(result.toolUseId).toBe("mcp-tool-456");
      expect(result.name).toBe("M_abc123_0");
      expect(result.input).toEqual({ param: "value" });
      expect(result.error).toBeUndefined();
    });

    it("should return error for unknown tool", () => {
      const toolUse: ToolUseBlock = {
        toolUseId: "unknown-789",
        name: "unknown_tool",
        input: {},
      };

      const result = parseToolUse(toolUse, mockTools);

      expect(result.toolUseId).toBe("unknown-789");
      expect(result.name).toBe("unknown_tool");
      expect(result.error).toContain("Unsupported tool: unknown_tool");
    });

    it("should handle string input by parsing JSON", () => {
      const toolUse: ToolUseBlock = {
        toolUseId: "tool-json",
        name: "web_search",
        input: '{"query": "json test"}' as any,
      };

      const result = parseToolUse(toolUse, mockTools);

      expect(result.input).toEqual({ query: "json test" });
    });

    it("should handle missing toolUseId", () => {
      const toolUse: ToolUseBlock = {
        toolUseId: undefined,
        name: "web_search",
        input: { query: "test" },
      };

      const result = parseToolUse(toolUse, mockTools);

      expect(result.toolUseId).toBe("unknown_id");
    });
  });

  describe("callBedrockTool", () => {
    it("should call the correct tool and return result", async () => {
      const mockCall = jest.fn().mockResolvedValue({
        toolUseId: "test-id",
        content: [{ text: "success" }],
      });

      const tools: BedrockToolCallable[] = [
        {
          name: "test_tool",
          toolSpec: { name: "test_tool" },
          call: mockCall,
        } as unknown as BedrockToolCallable,
      ];

      const toolCall: BedrockToolCall = {
        name: "test_tool",
        toolUseId: "test-id",
        input: { arg: "value" },
      };

      const result = await callBedrockTool(toolCall, {} as any, tools);

      expect(mockCall).toHaveBeenCalledWith({ arg: "value" }, "test-id", {}, undefined);
      expect(result.toolUseId).toBe("test-id");
    });

    it("should return error for unsupported tool", async () => {
      const toolCall: BedrockToolCall = {
        name: "unsupported",
        toolUseId: "test-id",
        input: {},
      };

      const result = await callBedrockTool(toolCall, {} as any, []);

      expect(result.status).toBe("error");
      expect((result.content?.[0] as any).text).toContain("Unsupported tool: unsupported");
    });

    it("should handle tool execution errors", async () => {
      const mockCall = jest.fn().mockRejectedValue(new Error("Tool execution failed"));

      const tools: BedrockToolCallable[] = [
        {
          name: "failing_tool",
          toolSpec: { name: "failing_tool" },
          call: mockCall,
        } as unknown as BedrockToolCallable,
      ];

      const toolCall: BedrockToolCall = {
        name: "failing_tool",
        toolUseId: "test-id",
        input: {},
      };

      const result = await callBedrockTool(toolCall, {} as any, tools);

      expect(result.status).toBe("error");
      expect((result.content?.[0] as any).text).toContain("Error executing tool");
      expect((result.content?.[0] as any).text).toContain("Tool execution failed");
    });
  });

  describe("formatBedrockMcpTools", () => {
    const createMockMcpServer = (id: string, name: string, tools: any[]): MCPServer => ({
      id,
      name,
      url: "http://localhost:3000",
      transportType: MCPTransportType.STREAMABLE_HTTP,
      authType: MCPAuthType.NONE,
      tools,
      isActive: true,
      user: null as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it("should return empty array when no tools provided", () => {
      const result = formatBedrockMcpTools(undefined, []);
      expect(result).toEqual([]);
    });

    it("should return empty array when no MCP servers provided", () => {
      const tools = [{ type: ToolType.MCP, name: "test", id: "server-1" }];
      const result = formatBedrockMcpTools(tools, undefined);
      expect(result).toEqual([]);
    });

    it("should format MCP tools correctly", () => {
      const mcpServer = createMockMcpServer("abc-123", "TestServer", [
        {
          name: "get_data",
          description: "Get data from source",
          inputSchema: JSON.stringify({
            type: "object",
            properties: { id: { type: "string" } },
          }),
        },
      ]);

      const tools = [{ type: ToolType.MCP, name: "TestServer", id: "abc-123" }];
      const result = formatBedrockMcpTools(tools, [mcpServer]);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("M_abc123_0"); // id with dashes removed + index
      expect(result[0].mcpToolName).toBe("get_data");
      expect(result[0].status).toBe(ResponseStatus.MCP_CALL);
      expect(result[0].toolSpec?.description).toContain("get_data");
      expect(typeof result[0].call).toBe("function");
    });

    it("should format multiple MCP tools from same server", () => {
      const mcpServer = createMockMcpServer("abc-123", "TestServer", [
        {
          name: "tool_one",
          description: "First tool",
          inputSchema: JSON.stringify({ type: "object", properties: {} }),
        },
        {
          name: "tool_two",
          description: "Second tool",
          inputSchema: JSON.stringify({ type: "object", properties: {} }),
        },
      ]);

      const tools = [{ type: ToolType.MCP, name: "TestServer", id: "abc-123" }];
      const result = formatBedrockMcpTools(tools, [mcpServer]);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("M_abc123_0");
      expect(result[0].mcpToolName).toBe("tool_one");
      expect(result[1].name).toBe("M_abc123_1");
      expect(result[1].mcpToolName).toBe("tool_two");
    });
  });

  describe("formatBedrockRequestTools", () => {
    it("should return empty array when no tools provided", () => {
      const result = formatBedrockRequestTools(undefined, undefined);
      expect(result).toEqual([]);
    });

    it("should include web search tool when requested", () => {
      const tools = [{ type: ToolType.WEB_SEARCH, name: "Web Search" }];
      const result = formatBedrockRequestTools(tools, undefined);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("web_search");
    });

    it("should combine web search and MCP tools", () => {
      const mcpServer: MCPServer = {
        id: "test-server",
        name: "TestMCP",
        url: "http://localhost:3000",
        transportType: MCPTransportType.STREAMABLE_HTTP,
        authType: MCPAuthType.NONE,
        tools: [
          {
            name: "mcp_tool",
            description: "MCP tool",
            inputSchema: JSON.stringify({ type: "object", properties: {} }),
          },
        ],
        isActive: true,
        user: null as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const tools = [
        { type: ToolType.WEB_SEARCH, name: "Web Search" },
        { type: ToolType.MCP, name: "TestMCP", id: "test-server" },
      ];

      const result = formatBedrockRequestTools(tools, [mcpServer]);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("web_search");
      expect(result[1].name).toBe("M_testserver_0");
    });
  });
});
