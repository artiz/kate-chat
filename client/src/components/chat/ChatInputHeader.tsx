import React, { useEffect, useState } from "react";
import { ActionIcon, Select, Tooltip, Popover } from "@mantine/core";
import { IconRobot, IconSettings, IconWorldSearch, IconCloudCode } from "@tabler/icons-react";
import { ChatSettings } from "./ChatSettings";
import { ModelInfo } from "@/components/models/ModelInfo";
import { ToolType, ChatTool, Model } from "@/types/graphql";
import { UpdateChatInput } from "@/hooks/useChatMessages";
import { ChatSettingsProps, DEFAULT_CHAT_SETTINGS } from "./ChatSettings/ChatSettings";

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
  useEffect(() => {
    if (chatTools) {
      setSelectedTools(new Set(chatTools.map(tool => tool.type)));
    } else {
      setSelectedTools(new Set());
    }
  }, [chatTools]);

  const handleModelChange = (modelId: string | null) => {
    onUpdateChat(chatId, { modelId: modelId || undefined });
  };

  const handleSettingsChange = (settings: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    imagesCount?: number;
  }) => {
    onUpdateChat(chatId, {
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      topP: settings.topP,
      imagesCount: settings.imagesCount,
    });
  };

  const resetSettingsToDefaults = () => {
    handleSettingsChange(DEFAULT_CHAT_SETTINGS);
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
    onUpdateChat(chatId, { tools: Array.from(tools).map(type => ({ type, name: type })) });
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
      {selectedModel && <ModelInfo model={selectedModel} size="18" />}

      <Popover width={300} position="top" withArrow shadow="md">
        <Popover.Target>
          <Tooltip label="Chat Settings">
            <ActionIcon disabled={disabled || streaming}>
              <IconSettings size="1.2rem" />
            </ActionIcon>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown>
          <ChatSettings
            {...chatSettings}
            onSettingsChange={handleSettingsChange}
            resetToDefaults={resetSettingsToDefaults}
          />
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
    </>
  );
};
