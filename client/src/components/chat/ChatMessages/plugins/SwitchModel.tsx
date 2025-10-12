import React from "react";
import { ActionIcon, Menu, Tooltip } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { Message, SwitchModelResponse } from "@/types/graphql";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { MessageRole, PluginProps } from "@katechat/ui";
import { useAppSelector } from "@/store";
import { useMemo } from "react";
import { ModelType } from "@/store/slices/modelSlice";
import { ProviderIcon } from "@/components/icons/ProviderIcon";
import { SWITCH_MODEL_MUTATION } from "@/store/services/graphql";
import { ok } from "@/lib/assert";
import classes from "../ChatMessage.module.scss";

/** Call Others button - only show on parent Assistant messages */
export const SwitchModel = ({
  message,
  disabled = false,
  onAddMessage,
  onAction,
  onActionEnd,
}: PluginProps<Message>) => {
  const { role, id, modelId, modelName, streaming, linkedToMessageId } = message;
  const { models: allModels } = useAppSelector(state => state.models);
  const activeModels = useMemo(() => {
    return allModels.filter(m => m.isActive && m.type !== ModelType.EMBEDDING && m.modelId != modelId);
  }, [allModels, modelId]);

  // Switch model mutation
  const [switchModel, { loading: switchingModel }] = useMutation<SwitchModelResponse>(SWITCH_MODEL_MUTATION, {
    onCompleted: res => {
      onActionEnd?.(id);
      if (res.switchModel.error) {
        return notifications.show({
          title: "Error",
          message: res.switchModel.error,
          color: "red",
        });
      }
      onAddMessage?.(res.switchModel.message);
    },
    onError: error => {
      onActionEnd?.(id);
      notifications.show({
        title: "Error",
        message: error.message || "Failed to switch model",
        color: "red",
      });
    },
  });

  const handleSelectModel = (modelId: string) => () => {
    ok(id, "Message id is required to switch model");
    ok(modelId);

    onAction?.(id);
    switchModel({
      variables: {
        messageId: id,
        modelId,
      },
    });
  };

  if (linkedToMessageId) {
    return null;
  }

  return role === MessageRole.ASSISTANT || role === MessageRole.ERROR ? (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <ActionIcon size="sm" color="gray" variant="transparent" disabled={disabled || streaming || switchingModel}>
          <Tooltip label={`Switch model: ${modelName}`} position="top" withArrow>
            <IconRefresh />
          </Tooltip>
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown className={classes.switchModelDropdown}>
        {activeModels.map(model => (
          <Menu.Item
            key={model.id}
            data-message-id={id}
            data-model-id={model.modelId}
            className="switch-model-btn"
            leftSection={<ProviderIcon apiProvider={model.apiProvider} provider={model.provider} />}
            onClick={handleSelectModel(model.modelId)}
          >
            {model.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  ) : null;
};
