import React, { useMemo } from "react";
import { Paper, Text, Stack, Group, Avatar, Loader, Box } from "@mantine/core";
import { IconRobot, IconUser } from "@tabler/icons-react";
import { Message, MessageRole } from "@/store/slices/chatSlice";

import classes from "./ChatMessages.module.scss";

interface ChatMessagesProps {
  messages: Message[];
  sending: boolean;
  selectedModelName?: string;
}

interface ChatMessageProps {
  message: Message;
}

const ChatMessage = (props: ChatMessageProps) => {
  const { role, id, modelName, content, html, createdAt, user } = props.message;

  const cmp = useMemo(() => {
    const isUserMessage = role === MessageRole.USER;
    const username = isUserMessage
      ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "You"
      : modelName || "AI";

    const timestamp = new Date(createdAt).toLocaleString();

    return (
      <>
        <Group align="center">
          <Avatar radius="xl" size="md">
            {isUserMessage ? <IconUser /> : <IconRobot />}
          </Avatar>
          <Group gap="xs">
            <Text size="sm" fw={500} c={isUserMessage ? "blue" : "dark"}>
              {username}
            </Text>
            <Text size="xs" c="dimmed">
              {timestamp}
            </Text>
          </Group>
        </Group>
        <Paper className={`${classes.message} ${classes[role]}`} p="md">
          {html ? (
            html.map((part, index) => <Text key={index} dangerouslySetInnerHTML={{ __html: part }} />)
          ) : (
            <Text>{content}</Text>
          )}
        </Paper>
      </>
    );
  }, [role, id, user, modelName, content, html, createdAt]);

  return cmp;
};

export const ChatMessages: React.FC<ChatMessagesProps> = ({ messages, sending, selectedModelName }) => {
  return (
    <Stack gap="md">
      {messages.map(msg => (
        <Group key={msg.id} align="flex-start" gap="xs">
          <ChatMessage message={msg} />
        </Group>
      ))}

      {sending && (
        <Group align="flex-start" gap="xs">
          <Avatar color="gray" radius="xl">
            <IconRobot size={20} />
          </Avatar>
          <Box>
            <Text size="sm" fw={500}>
              {selectedModelName || "AI"}
            </Text>
            <Paper p="sm" bg="gray.0" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Text size="sm" c="dimmed">
                Generating response
              </Text>
              <Loader size="xs" />
            </Paper>
          </Box>
        </Group>
      )}
    </Stack>
  );
};
