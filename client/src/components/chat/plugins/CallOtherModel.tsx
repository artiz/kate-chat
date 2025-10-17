import React from "react";
import { ActionIcon, Menu, Tooltip } from "@mantine/core";
import { IconMoodPlus } from "@tabler/icons-react";
import { CallOthersResponse, Message } from "@/types/graphql";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { MessageRole, ModelType, PluginProps } from "@katechat/ui";
import { useAppSelector } from "@/store";
import { useMemo } from "react";
import { CALL_OTHER_MUTATION } from "@/store/services/graphql";
import { assert } from "@katechat/ui";
import classes from "./Plugins.module.scss";
import { ProviderIcon } from "@katechat/ui";

/** Call Others button - only show on parent Assistant messages */

export const CallOtherModel = ({
  message,
  disabled = false,
  onAddMessage,
  onAction,
  onActionEnd,
}: PluginProps<Message>) => {
  const { role, id, modelId, streaming } = message;
  const { models: allModels } = useAppSelector(state => state.models);
  const activeModels = useMemo(() => {
    return allModels.filter(m => m.isActive && m.type !== ModelType.EMBEDDING && m.modelId != modelId);
  }, [allModels, modelId]);

  // Call Others mutation
  const [callOther, { loading: callingOthers }] = useMutation<CallOthersResponse>(CALL_OTHER_MUTATION, {});

  if (message.linkedToMessageId) {
    return null;
  }

  const handleSelectModel = (modelId: string) => () => {
    assert.ok(id, "Message id is required to call other model");
    assert.ok(modelId);

    onAction?.(id);
    callOther({
      variables: {
        messageId: id,
        modelId,
      },
    })
      .then(res => {
        onActionEnd?.(id);
        if (res.data?.callOther?.error) {
          return notifications.show({
            title: "Error",
            message: res.data.callOther.error,
            color: "red",
          });
        }
        assert.ok(res.data?.callOther?.message, "Call Other response should contain a message");
        onAddMessage?.(res.data.callOther.message);
      })
      .catch(error => {
        onActionEnd?.(id);
        notifications.show({
          title: "Error",
          message: error.message || "Failed to call other models",
          color: "red",
        });
      });
  };

  return role === MessageRole.ASSISTANT ? (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <ActionIcon size="sm" color="gray" variant="transparent" disabled={disabled || streaming || callingOthers}>
          <Tooltip label="Call other model" position="top" withArrow>
            <IconMoodPlus />
          </Tooltip>
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown className={classes.switchModelDropdown}>
        {activeModels.map(model => (
          <Menu.Item
            key={model.id}
            data-message-id={id}
            data-model-id={model.modelId}
            className="call-other-btn"
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
