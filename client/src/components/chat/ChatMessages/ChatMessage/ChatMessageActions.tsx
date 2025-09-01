import React, { useMemo } from "react";
import { Text, ActionIcon, Tooltip, Menu } from "@mantine/core";
import { IconCopy, IconCopyCheck, IconTrash, IconRefresh, IconMoodPlus, IconEdit } from "@tabler/icons-react";

import classes from "../ChatMessage.module.scss";
import { useAppSelector } from "@/store";
import { ProviderIcon } from "@/components/icons/ProviderIcon";
import { ModelType } from "@/store/slices/modelSlice";
import { MessageMetadata } from "@/store/services/graphql";
import { MessageRole } from "@/types/ai";

interface IProps {
  id: string;
  role: MessageRole;
  modelName?: string;
  modelId?: string;
  metadata?: MessageMetadata;
  index: number;
  disableActions?: boolean;
}

export const ChatMessageActions = (props: IProps) => {
  const { id, role, modelName, modelId, metadata, index, disableActions = false } = props;
  const { models: allModels } = useAppSelector(state => state.models);
  const models = useMemo(() => {
    return allModels.filter(model => model.isActive && model.type !== ModelType.EMBEDDING);
  }, [allModels]);

  const actions = useMemo(() => {
    return (
      <>
        <Tooltip label="Copy message" position="top" withArrow>
          <ActionIcon
            className="copy-message-btn"
            data-message-id={id}
            data-message-index={index}
            size="sm"
            color="gray"
            variant="transparent"
            disabled={disableActions}
          >
            <IconCopy />
          </ActionIcon>
        </Tooltip>
        <ActionIcon disabled size="sm" className="check-icon">
          <IconCopyCheck />
        </ActionIcon>
        <Tooltip label="Delete message" position="top" withArrow>
          <ActionIcon
            className="delete-message-btn"
            data-message-id={id}
            size="sm"
            color="red.4"
            variant="transparent"
            disabled={disableActions}
          >
            <IconTrash />
          </ActionIcon>
        </Tooltip>

        {role === MessageRole.USER && (
          <Tooltip label="Edit message" position="top" withArrow>
            <ActionIcon
              className="edit-message-btn"
              data-message-id={id}
              size="sm"
              color="blue.4"
              variant="transparent"
              disabled={disableActions}
            >
              <IconEdit />
            </ActionIcon>
          </Tooltip>
        )}

        {(role === MessageRole.ASSISTANT || role === MessageRole.ERROR) && (
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <ActionIcon size="sm" color="gray" variant="transparent" disabled={disableActions}>
                <Tooltip label={`Switch model: ${modelName}`} position="top" withArrow>
                  <IconRefresh />
                </Tooltip>
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown className={classes.switchModelDropdown}>
              {models
                .filter(m => m.modelId != modelId)
                .map(model => (
                  <Menu.Item
                    key={model.id}
                    data-message-id={id}
                    data-model-id={model.modelId}
                    className="switch-model-btn"
                    leftSection={<ProviderIcon apiProvider={model.apiProvider} provider={model.provider} />}
                  >
                    {model.name}
                  </Menu.Item>
                ))}

              {/* <Menu.Divider /> */}
            </Menu.Dropdown>
          </Menu>
        )}

        {/* Call Others button - only show on parent Assistant messages */}
        {role === MessageRole.ASSISTANT && (
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <ActionIcon size="sm" color="gray" variant="transparent" disabled={disableActions}>
                <Tooltip label="Call other model" position="top" withArrow>
                  <IconMoodPlus />
                </Tooltip>
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown className={classes.switchModelDropdown}>
              {models
                .filter(m => m.modelId != modelId)
                .map(model => (
                  <Menu.Item
                    key={model.id}
                    data-message-id={id}
                    data-model-id={model.modelId}
                    className="call-other-btn"
                    leftSection={<ProviderIcon apiProvider={model.apiProvider} provider={model.provider} />}
                  >
                    {model.name}
                  </Menu.Item>
                ))}
            </Menu.Dropdown>
          </Menu>
        )}

        {/* Token usage display */}
        {metadata?.usage && (metadata.usage.inputTokens || metadata.usage.outputTokens) && (
          <Tooltip
            label={`Input tokens: ${metadata.usage.inputTokens || "N/A"}, Output tokens: ${metadata.usage.outputTokens || "N/A"}`}
            position="top"
            withArrow
          >
            <Text size="xs" c="dimmed" style={{ marginLeft: "auto", cursor: "help" }}>
              IN: {metadata.usage.inputTokens || "N/A"}, OUT: {metadata.usage.outputTokens || "N/A"}
            </Text>
          </Tooltip>
        )}
      </>
    );
  }, [id, index, role, modelName, modelId, disableActions, metadata]);

  return actions;
};

ChatMessageActions.displayName = "ChatMessageActions";
