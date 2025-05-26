import React, { useMemo } from "react";
import { Paper, Text, Stack, Group, Avatar, Loader, Box } from "@mantine/core";
import { IconRobot, IconUser } from "@tabler/icons-react";
import { Message, MessageRole } from "@/store/slices/chatSlice";

import classes from "./ChatMessages.module.scss";

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
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

    return (
      <>
        <Group align="center">
          <Avatar radius="xl">{isUserMessage ? <IconUser size={20} /> : <IconRobot size={20} />}</Avatar>
          <Stack gap="xs">
            <Text size="sm" fw={500} c={isUserMessage ? "blue" : "dark"}>
              {username}
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              {new Date(createdAt).toLocaleTimeString()}
            </Text>
          </Stack>
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

export const ChatMessages: React.FC<ChatMessagesProps> = ({ messages, isLoading, sending, selectedModelName }) => {
  return (
    <>
      {isLoading ? (
        <Group align="center" py="xl">
          <Loader />
        </Group>
      ) : messages.length === 0 ? (
        <Stack align="center" justify="center" h="100%" gap="md">
          <IconRobot size={48} opacity={0.5} />
          <Text size="lg" ta="center">
            No messages yet
          </Text>
          <Text c="dimmed" size="sm" ta="center">
            Start the conversation by sending a message
          </Text>
        </Stack>
      ) : (
        <Stack gap="lg">
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
      )}
    </>
  );
};
