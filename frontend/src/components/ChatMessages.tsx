import React from "react";
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

const ChatMessages: React.FC<ChatMessagesProps> = ({ messages, isLoading, sending, selectedModelName }) => {
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
              <Group align="center">
                <Avatar color={msg.role === MessageRole.USER ? "blue" : "gray"} radius="xl">
                  {msg.role === "user" ? <IconUser size={20} /> : <IconRobot size={20} />}
                </Avatar>
                <Stack gap="xs">
                  <Text size="sm" fw={500} c={msg.role === MessageRole.USER ? "blue" : "dark"}>
                    {msg.role === "user" ? "You" : msg.modelName || "AI"}
                  </Text>
                  <Text size="xs" c="dimmed" mt={2}>
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </Text>
                </Stack>
              </Group>
              <Paper className={classes.message} p="md">
                {msg.html ? (
                  msg.html.map((part, index) => <Text key={index} dangerouslySetInnerHTML={{ __html: part }} />)
                ) : (
                  <Text size="xs">{msg.content}</Text>
                )}
              </Paper>
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

export default ChatMessages;
