import React, { use, useEffect, useMemo, useState } from "react";
import { ActionIcon, Select, Tooltip, Modal, Box, Menu, Button, Group } from "@mantine/core";
import {
  IconRobot,
  IconSettings,
  IconWorldSearch,
  IconCloudCode,
  IconPlugConnected,
  IconPlugConnectedX,
  IconSquareCheck,
  IconSquare,
  IconLock,
  IconKey,
  IconArrowDown,
} from "@tabler/icons-react";
import { useQuery } from "@apollo/client";
import { ChatSettings } from "./ChatSettings";
import { ModelInfo } from "@/components/models/ModelInfo";
import { ToolType, ChatTool, Model, MCPServer } from "@/types/graphql";
import { UpdateChatInput } from "@/hooks/useChatMessages";
import { ChatSettingsProps, DEFAULT_CHAT_SETTINGS } from "./ChatSettings/ChatSettings";
import { assert } from "@katechat/ui";
import { useMcpAuth, requiresTokenEntry, requiresAuth, McpTokenModal } from "@/components/auth/McpAuthentication";
import { GET_MCP_SERVERS_FOR_CHAT } from "@/store/services/graphql.queries";
import { RootState } from "@/store";
import { useSelector } from "react-redux";
import { MOBILE_BREAKPOINT } from "@/lib/config";
import { useMediaQuery, useDisclosure, useLocalStorage } from "@mantine/hooks";

// Re-export for backwards compatibility
export { getMcpAuthToken } from "@/components/auth/McpAuthentication";

interface IHeaderProps {
  chatId?: string;
  disabled?: boolean;
  streaming: boolean;
  chatTools?: ChatTool[];
  chatSettings?: ChatSettingsProps;
  models: Model[];
  selectedModel?: Model;
  onUpdateChat: (chatId: string | undefined, input: UpdateChatInput, afterUpdate?: () => void) => void;
  onAutoScroll?: (value: boolean) => void;
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
  onAutoScroll,
}: IHeaderProps) => {
  const [settingsOpened, { open: openSettings, close: closeSettings }] = useDisclosure(false);
  const [selectedTools, setSelectedTools] = useState<Set<ToolType> | undefined>();
  const [selectedMcpServers, setSelectedMcpServers] = useState<Set<string>>(new Set());
  const { token: userToken } = useSelector((state: RootState) => state.auth);
  const [autoScroll, setAutoScroll] = useLocalStorage<boolean>({ key: "chat-auto-scroll", defaultValue: true });

  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);

  // Query MCP servers when MCP tool is supported
  const { data: mcpServersData } = useQuery(GET_MCP_SERVERS_FOR_CHAT, {
    skip: !selectedModel?.tools?.includes(ToolType.MCP),
  });

  const mcpServers: MCPServer[] = useMemo(() => {
    return mcpServersData?.getMCPServers?.servers?.filter((s: MCPServer) => s.isActive) || [];
  }, [mcpServersData?.getMCPServers?.servers]);

  const mcpServerMap = useMemo(() => new Map(mcpServers.map((s: MCPServer) => [s.id, s.name])), [mcpServers]);

  useEffect(() => {
    onAutoScroll?.(autoScroll);
  }, [autoScroll, setAutoScroll]);

  // MCP authentication hook
  const {
    mcpSubmitToken,
    mcpTokenModalServer,
    mcpNeedsAuthentication,
    mcpInitiateAuth,
    mcpTokenValue,
    mcpSetTokenValue,
    mcpCloseTokenModal,
    mcpAuthStatus,
  } = useMcpAuth(mcpServers, chatId);

  useEffect(() => {
    if (chatTools) {
      setSelectedTools(new Set(chatTools.map(tool => tool.type)));
      // Extract MCP server names from chat tools
      const mcpTools = chatTools.filter(t => t.type === ToolType.MCP && t.id);
      setSelectedMcpServers(new Set(mcpTools.map(t => t.id || "").filter(assert.notEmpty)));
    } else {
      setSelectedTools(new Set());
      setSelectedMcpServers(new Set());
    }
  }, [chatTools]);

  useEffect(() => {
    const notAuthenticatedServer = mcpServers.find(server => {
      return selectedMcpServers.has(server.id) && mcpNeedsAuthentication(server);
    });

    if (notAuthenticatedServer) {
      assert.ok(userToken);
      mcpInitiateAuth(notAuthenticatedServer, userToken);
    }
  }, [selectedMcpServers, mcpServers, mcpAuthStatus]);

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

    // Find the server to check if auth is required
    const server = mcpServers.find(s => s.id === serverId);

    // If auth is required and user not authenticated, initiate auth flow
    if (server && mcpNeedsAuthentication(server)) {
      assert.ok(userToken);
      mcpInitiateAuth(server, userToken);
      return; // Don't toggle yet - wait for auth to complete
    }

    toggleMcpServer(serverId);
  };

  const toggleMcpServer = (serverId: string) => {
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

  const handleTokenSubmit = () => {
    // Get the serverId before submitToken clears the modal state
    const serverId = mcpTokenModalServer?.id;
    if (mcpSubmitToken() && serverId) {
      // Token saved, now toggle the server
      toggleMcpServer(serverId);
    }
  };

  return (
    <Group justify="space-between" align="center" style={{ flex: 1 }}>
      <Group>
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

        <Tooltip label="Chat Settings">
          <ActionIcon disabled={disabled || streaming} variant="default" onClick={openSettings}>
            <IconSettings size="1.2rem" />
          </ActionIcon>
        </Tooltip>
        <Modal
          opened={settingsOpened}
          onClose={closeSettings}
          title="Chat Settings"
          fullScreen={isMobile}
          size="lg"
          yOffset="auto"
          styles={{ content: { marginTop: "auto", marginBottom: "1rem" } }}
        >
          <ChatSettings {...chatSettings} onSettingsChange={handleSettingsChange} />
          <Button mt="md" onClick={closeSettings}>
            Close
          </Button>
        </Modal>

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
              {mcpServers.map(server => {
                const needsAuth = requiresAuth(server);
                const isAuthenticated = !needsAuth || mcpAuthStatus.get(server.id);
                const isSelected = selectedMcpServers.has(server.id);

                return (
                  <Menu.Item
                    key={server.id}
                    leftSection={isSelected ? <IconSquareCheck size="1rem" /> : <IconSquare size="1rem" />}
                    rightSection={
                      needsAuth && !isAuthenticated ? (
                        <Tooltip label={requiresTokenEntry(server) ? "Requires token" : "Requires authentication"}>
                          {requiresTokenEntry(server) ? (
                            <IconKey size="0.9rem" color="orange" />
                          ) : (
                            <IconLock size="0.9rem" color="orange" />
                          )}
                        </Tooltip>
                      ) : undefined
                    }
                    c={isSelected ? undefined : "dimmed"}
                    onClick={() => handleMcpServerToggle(server.id)}
                  >
                    {server.name}
                  </Menu.Item>
                );
              })}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>

      {/* Token Entry Modal for API Key / Bearer Token */}
      <McpTokenModal
        opened={!!mcpTokenModalServer}
        server={mcpTokenModalServer}
        tokenValue={mcpTokenValue}
        onTokenChange={mcpSetTokenValue}
        onSubmit={handleTokenSubmit}
        onClose={mcpCloseTokenModal}
      />
      <Group>
        {onAutoScroll && (
          <Tooltip label="Auto-Scroll">
            <ActionIcon
              variant={autoScroll ? "filled" : "default"}
              color={autoScroll ? "brand" : undefined}
              onClick={() => setAutoScroll?.(!autoScroll)}
            >
              <IconArrowDown size="1.2rem" />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Group>
  );
};
