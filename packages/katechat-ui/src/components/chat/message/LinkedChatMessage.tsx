import React, { useMemo } from "react";
import { Text, Group, Avatar } from "@mantine/core";
import { Carousel } from "@mantine/carousel";
import { IconRobot } from "@tabler/icons-react";

import { Message, Model } from "@/core";
import { ProviderIcon } from "@/components/icons/ProviderIcon";
import { MessageStatus } from "./MessageStatus";
import { CopyMessageButton } from "./controls/CopyMessageButton";

import "./ChatMessage.scss";

interface IProps {
  message: Message;
  parentIndex: number;
  index: number;
  models?: Model[];
  plugins?: React.ReactNode;
}

export const LinkedChatMessage = ({ message, parentIndex, index, plugins, models }: IProps) => {
  const model = useMemo(() => {
    return models?.find(m => m.modelId === message.modelId);
  }, [models, message.modelId]);

  return (
    <Carousel.Slide key={message.id} className="katechat-message-linked">
      <Group align="center">
        <Avatar radius="xl" size="md">
          {model ? <ProviderIcon apiProvider={model.apiProvider} provider={model.provider} /> : <IconRobot />}
        </Avatar>
        <Group gap="xs">
          <Text size="sm" fw={500} c="teal">
            {message.modelName}
          </Text>
          {message.status && <MessageStatus status={message.status} />}
          {message.statusInfo && (
            <Text size="xs" c="dimmed">
              {message.statusInfo}
            </Text>
          )}
        </Group>
      </Group>

      <div className="katechat-message-content">
        {message.html ? (
          message.html.map((part: string, index: number) => (
            <div key={index} dangerouslySetInnerHTML={{ __html: part }} />
          ))
        ) : (
          <div>{message.content}</div>
        )}

        <div className="katechat-message-footer">
          <CopyMessageButton messageId={message.id} messageIndex={parentIndex} linkedMessageIndex={index} />

          {plugins}
        </div>
      </div>
    </Carousel.Slide>
  );
};

LinkedChatMessage.displayName = "LinkedChatMessage";
