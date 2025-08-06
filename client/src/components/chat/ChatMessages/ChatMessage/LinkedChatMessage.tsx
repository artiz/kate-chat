import React, { use, useMemo } from "react";
import { Text, Group, Avatar, ActionIcon, Tooltip } from "@mantine/core";
import { Carousel } from "@mantine/carousel";
import { IconCopy, IconCopyCheck, IconRobot, IconTrash } from "@tabler/icons-react";
import { Message, MessageRole } from "@/store/slices/chatSlice";

import classes from "../ChatMessage.module.scss";
import { useAppSelector } from "@/store";
import { ProviderIcon } from "@/components/icons/ProviderIcon";

interface IProps {
  message: Message;
  parentIndex: number;
  index: number;
  disableActions?: boolean;
}

export const LinkedChatMessage = ({ message, parentIndex, index, disableActions }: IProps) => {
  const { models } = useAppSelector(state => state.models);
  var model = useMemo(() => {
    return models.find(m => m.id === message.modelId);
  }, [models, message.modelId]);

  return (
    <Carousel.Slide key={message.id} className={classes.linkedMessageContainer}>
      <Group align="center">
        <Avatar radius="xl" size="md">
          {model ? <ProviderIcon apiProvider={model.apiProvider} provider={model.provider} /> : <IconRobot />}
        </Avatar>
        <Group gap="xs">
          <Text size="xs" fw={500} c="teal">
            {message.modelName}
          </Text>
          {message.metadata?.usage && (
            <Text size="xs" c="dimmed">
              OUT: {message.metadata.usage.outputTokens || "N/A"}
            </Text>
          )}
        </Group>
      </Group>

      <div className={classes.message}>
        {message.html ? (
          message.html.map((part, index) => <div key={index} dangerouslySetInnerHTML={{ __html: part }} />)
        ) : (
          <div>{message.content}</div>
        )}

        <div className={classes.messageFooter}>
          <Tooltip label="Copy message" position="top" withArrow>
            <ActionIcon
              className="copy-message-btn"
              data-message-id={message.id}
              data-message-index={parentIndex}
              data-message-linked-index={index}
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
              data-message-id={message.id}
              data-message-is-linked="true"
              size="sm"
              color="red.4"
              variant="transparent"
              disabled={disableActions}
            >
              <IconTrash />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
    </Carousel.Slide>
  );
};

LinkedChatMessage.displayName = "LinkedChatMessage";
