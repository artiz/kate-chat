import React, { use, useEffect, useMemo, useState } from "react";
import { ActionIcon, Select, Tooltip, Popover, Box, Menu } from "@mantine/core";
import {
  IconRobot,
  IconSettings,
  IconWorldSearch,
  IconCloudCode,
  IconPlugConnected,
  IconPlugConnectedX,
  IconCheckbox,
  IconSquareCheck,
  IconSquare,
} from "@tabler/icons-react";
import { gql, useQuery } from "@apollo/client";
import { ChatSettings } from "./ChatSettings";
import { ModelInfo } from "@/components/models/ModelInfo";
import { ToolType, ChatTool, Model } from "@/types/graphql";
import { UpdateChatInput } from "@/hooks/useChatMessages";
import { ChatSettingsProps, DEFAULT_CHAT_SETTINGS } from "./ChatSettings/ChatSettings";
import { notEmpty } from "../../../../packages/katechat-ui/src/lib/assert";

// MCP servers query for MCP tool dropdown
const GET_MCP_SERVERS = gql`
  query GetMCPServersForChat {
    getMCPServers {
      servers {
        id
        name
        isActive
      }
    }
  }
`;

interface MCPServerInfo {
  id: string;
  name: string;
  isActive: boolean;
}

interface IHeaderProps {
  chatId?: string;
  disabled?: boolean;
  streaming: boolean;
  chatTools?: ChatTool[];
  chatSettings?: ChatSettingsProps;
  models: Model[];
  selectedModel?: Model;
  onUpdateChat: (chatId: string | undefined, input: UpdateChatInput, afterUpdate?: () => void) => void;
}

export const ChatInputHeader = ({
  chatId,
  disabled = false,
  streaming,
  chatTools,
  chatSettings = DEFAULT_CHAT_SETTINGS,
  models,
  selectedModel,
  onUpdateChat,
}: IHeaderProps) => {
  const [selectedTools, setSelectedTools] = useState<Set<ToolType> | undefined>();
  const [selectedMcpServers, setSelectedMcpServers] = useState<Set<string>>(new Set());

  // Query MCP servers when MCP tool is supported
  const { data: mcpServersData } = useQuery(GET_MCP_SERVERS, {
    skip: !selectedModel?.tools?.includes(ToolType.MCP),
  });

  const mcpServers: MCPServerInfo[] =
    mcpServersData?.getMCPServers?.servers?.filter((s: MCPServerInfo) => s.isActive) || [];

  const mcpServerMap = useMemo(() => new Map(mcpServers.map((s: MCPServerInfo) => [s.id, s.name])), [mcpServers]);

  useEffect(() => {
    if (chatTools) {
      setSelectedTools(new Set(chatTools.map(tool => tool.type)));
      // Extract MCP server names from chat tools
      const mcpTools = chatTools.filter(t => t.type === ToolType.MCP && t.id);
      setSelectedMcpServers(new Set(mcpTools.map(t => t.id || "").filter(notEmpty)));
    } else {
      setSelectedTools(new Set());
      setSelectedMcpServers(new Set());
    }
  }, [chatTools]);

  const handleModelChange = (modelId: string | null) => {
    onUpdateChat(chatId, { modelId: modelId || undefined });
  };

  const handleSettingsChange = (settings: ChatSettingsProps) => {
    onUpdateChat(chatId, { ...settings });
  };

  const handleToolToggle = (toolType: ToolType) => {
    if (!chatId) return;

    const tools = new Set(selectedTools || []);
    if (tools.has(toolType)) {
      tools.delete(toolType);
    } else {
      tools.add(toolType);
    }

    setSelectedTools(tools);

    // Build tools array, including MCP servers
    const toolsArray: { type: ToolType; name: string; id?: string }[] = Array.from(tools)
      .filter(t => t !== ToolType.MCP) // MCP is handled separately
      .map(type => ({ type, name: type as string }));

    // Add MCP tools
    if (tools.has(ToolType.MCP)) {
      selectedMcpServers.forEach(id => {
        toolsArray.push({ type: ToolType.MCP, name: mcpServerMap.get(id) || id, id });
      });
    }

    onUpdateChat(chatId, { tools: toolsArray });
  };

  const handleMcpServerToggle = (serverId: string) => {
    if (!chatId) return;

    const servers = new Set(selectedMcpServers);
    if (servers.has(serverId)) {
      servers.delete(serverId);
    } else {
      servers.add(serverId);
    }
    setSelectedMcpServers(servers);

    // Enable MCP tool type if any server is selected
    const tools = new Set(selectedTools || []);
    if (servers.size > 0) {
      tools.add(ToolType.MCP);
    } else {
      tools.delete(ToolType.MCP);
    }
    setSelectedTools(tools);

    // Build tools array
    const toolsArray: { type: ToolType; name: string; id?: string }[] = Array.from(tools)
      .filter(t => t !== ToolType.MCP)
      .map(type => ({ type, name: type as string }));

    // Add MCP tools
    servers.forEach(id => {
      toolsArray.push({ type: ToolType.MCP, name: mcpServerMap.get(id) || id, id });
    });

    onUpdateChat(chatId, { tools: toolsArray });
  };

  return (
    <>
      <IconRobot size={20} />
      <Select
        data={models.map(model => ({
          value: model.modelId,
          label: `${model.provider}: ${model.name}`,
        }))}
        searchable
        value={selectedModel?.modelId || ""}
        onChange={handleModelChange}
        placeholder="Select a model"
        size="xs"
        clearable={false}
        style={{ maxWidth: "50%" }}
        disabled={disabled}
      />
      {selectedModel && (
        <Box visibleFrom="xs">
          <ModelInfo model={selectedModel} size="18" />
        </Box>
      )}

      <Popover position="top" withArrow shadow="md" trapFocus>
        <Popover.Target>
          <Tooltip label="Chat Settings">
            <ActionIcon disabled={disabled || streaming}>
              <IconSettings size="1.2rem" />
            </ActionIcon>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown>
          <ChatSettings {...chatSettings} onSettingsChange={handleSettingsChange} />
        </Popover.Dropdown>
      </Popover>

      {/* Tool buttons */}
      {selectedModel?.tools?.includes(ToolType.WEB_SEARCH) && (
        <Tooltip label="Web Search">
          <ActionIcon
            variant={selectedTools?.has(ToolType.WEB_SEARCH) ? "filled" : "default"}
            color={selectedTools?.has(ToolType.WEB_SEARCH) ? "brand" : undefined}
            onClick={() => handleToolToggle(ToolType.WEB_SEARCH)}
            disabled={disabled || streaming}
          >
            <IconWorldSearch size="1.2rem" />
          </ActionIcon>
        </Tooltip>
      )}

      {selectedModel?.tools?.includes(ToolType.CODE_INTERPRETER) && (
        <Tooltip label="Code Interpreter">
          <ActionIcon
            variant={selectedTools?.has(ToolType.CODE_INTERPRETER) ? "filled" : "default"}
            color={selectedTools?.has(ToolType.CODE_INTERPRETER) ? "brand" : undefined}
            onClick={() => handleToolToggle(ToolType.CODE_INTERPRETER)}
            disabled={disabled || streaming}
          >
            <IconCloudCode size="1.2rem" />
          </ActionIcon>
        </Tooltip>
      )}

      {/* MCP Servers dropdown */}
      {mcpServers.length > 0 && selectedModel?.tools?.includes(ToolType.MCP) && (
        <Menu position="top" withArrow shadow="md">
          <Menu.Target>
            <Tooltip label="MCP Tools">
              <ActionIcon
                variant={selectedMcpServers.size > 0 ? "filled" : "default"}
                color={selectedMcpServers.size > 0 ? "brand" : undefined}
                disabled={disabled || streaming}
              >
                {selectedMcpServers.size > 0 ? (
                  <IconPlugConnected size="1.2rem" />
                ) : (
                  <IconPlugConnectedX size="1.2rem" />
                )}
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>MCP Servers</Menu.Label>
            {mcpServers.map(server => (
              <Menu.Item
                key={server.id}
                leftSection={
                  selectedMcpServers.has(server.id) ? <IconSquareCheck size="1rem" /> : <IconSquare size="1rem" />
                }
                c={selectedMcpServers.has(server.id) ? undefined : "dimmed"}
                onClick={() => handleMcpServerToggle(server.id)}
              >
                {server.name}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}
    </>
  );
};
