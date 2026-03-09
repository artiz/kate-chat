import React, { useMemo } from "react";
import { Text, Group, Avatar, Box } from "@mantine/core";
import { IconRobot } from "@tabler/icons-react";

import { Message, Model, ResponseStatus } from "@/core";
import { ProviderIcon } from "@/components/icons/ProviderIcon";
import { MessageStatus } from "./MessageStatus";
import { CopyMessageButton } from "./controls/CopyMessageButton";

import "./ChatMessage.scss";
import { StreamingStatus } from "./StreamingStatus";
import { DetailsButton } from "./controls/DetailsButton";

interface IProps {
  message: Message;
  parentIndex: number;
  index: number;
  models?: Model[];
  plugins?: React.ReactNode;
  messageDetailsLoader?: (message: Message) => React.ReactNode;
}

export const LinkedChatMessage = ({ message, parentIndex, index, plugins, models, messageDetailsLoader }: IProps) => {
  const model = useMemo(() => {
    return models?.find(m => m.modelId === message.modelId);
  }, [models, message.modelId]);

  const details = useMemo(() => {
    return messageDetailsLoader?.(message) || null;
  }, [messageDetailsLoader, message]);

  return (
    <Box key={message.id} data-linked-message-id={message.id}>
      <Group align="center" pt="sm">
        <Avatar radius="xl" size="md">
          {model ? <ProviderIcon apiProvider={model.apiProvider} provider={model.provider} /> : <IconRobot />}
        </Avatar>
        <Group gap="xs">
          <Text size="sm" fw={500} c="teal">
            {message.modelName}
          </Text>
          {message.status && <MessageStatus status={message.status} />}
          {message.statusInfo && message.status !== ResponseStatus.REASONING && (
            <Text size="xs" c="dimmed">
              {message.statusInfo}
            </Text>
          )}
        </Group>
      </Group>

      <div className="katechat-message-content">
        <StreamingStatus
          status={message.status}
          content={message.content}
          statusInfo={message.statusInfo}
          streaming={message.streaming || false}
        />
        {message.html ? (
          message.html.map((part: string, index: number) => (
            <div key={index} dangerouslySetInnerHTML={{ __html: part }} />
          ))
        ) : (
          <div>{message.content}</div>
        )}

        <div className="katechat-message-footer">
          <CopyMessageButton messageId={message.id} messageIndex={parentIndex} linkedMessageIndex={index} />
          {details && <DetailsButton messageId={message.id} messageIndex={index} linkedMessageIndex={index} />}
          {plugins}
        </div>
        {details && <Box className="katechat-message-content-details">{details}</Box>}
      </div>
    </Box>
  );
};

LinkedChatMessage.displayName = "LinkedChatMessage";
