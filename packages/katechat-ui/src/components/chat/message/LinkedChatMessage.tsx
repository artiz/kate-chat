import React, { useMemo } from "react";
import { Text, Group, Avatar, ActionIcon, Tooltip } from "@mantine/core";
import { Carousel } from "@mantine/carousel";
import { IconCopy, IconCopyCheck, IconRobot } from "@tabler/icons-react";

import { Message, Model } from "@/core";
import { ProviderIcon } from "@/components/icons/ProviderIcon";
import { MessageStatus } from "./MessageStatus";

import classes from "./ChatMessage.module.scss";

interface IProps {
  message: Message;
  parentIndex: number;
  index: number;
  models?: Model[];
  plugins?: React.ReactNode;
}

export const LinkedChatMessage = ({ message, parentIndex, index, plugins, models }: IProps) => {
  var model = useMemo(() => {
    return models?.find(m => m.modelId === message.modelId);
  }, [models, message.modelId]);

  return (
    <Carousel.Slide key={message.id} className={classes.linkedMessageContainer}>
      <Group align="center">
        <Avatar radius="xl" size="md">
          {model ? <ProviderIcon apiProvider={model.apiProvider} provider={model.provider} /> : <IconRobot />}
        </Avatar>
        <Group gap="xs">
          <Text size="sm" fw={500} c="teal">
            {message.modelName}
          </Text>
          {message.status && (
            <>
              <MessageStatus status={message.status} />
              <Text size="xs" c="dimmed">
                {message.statusInfo}
              </Text>
            </>
          )}
        </Group>
      </Group>

      <div className={classes.message}>
        {message.html ? (
          message.html.map((part: string, index: number) => (
            <div key={index} dangerouslySetInnerHTML={{ __html: part }} />
          ))
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
            >
              <IconCopy />
            </ActionIcon>
          </Tooltip>
          <ActionIcon disabled size="sm" className="check-icon">
            <IconCopyCheck />
          </ActionIcon>

          {plugins}
        </div>
      </div>
    </Carousel.Slide>
  );
};

LinkedChatMessage.displayName = "LinkedChatMessage";
