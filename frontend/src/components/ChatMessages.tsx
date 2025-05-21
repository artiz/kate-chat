import React from "react";
import { Paper, Text, Stack, Group, Avatar, Loader, Box } from "@mantine/core";
import { IconRobot, IconUser } from "@tabler/icons-react";

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant" | string;
  createdAt: string;
  modelName?: string;
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  sending: boolean;
  selectedModelName?: string;
}

const ChatMessages: React.FC<ChatMessagesProps> = ({ messages, isLoading, sending, selectedModelName }) => {
  return (
    <Paper withBorder p="md" style={{ flexGrow: 1, overflowY: "auto", marginBottom: "1rem" }}>
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
              <Avatar color={msg.role === "user" ? "blue" : "gray"} radius="xl">
                {msg.role === "user" ? <IconUser size={20} /> : <IconRobot size={20} />}
              </Avatar>
              <Box
                style={{
                  maxWidth: "calc(100% - 50px)",
                  wordWrap: "break-word",
                }}
              >
                <Text size="sm" fw={500} c={msg.role === "user" ? "blue" : "dark"}>
                  {msg.role === "user" ? "You" : msg.modelName || "AI"}
                </Text>
                <Paper p="sm" bg={msg.role === "user" ? "teal.0" : "teal.2"} style={{ whiteSpace: "pre-wrap" }}>
                  <Text c="brand_contrast">{msg.content}</Text>
                </Paper>
                <Text size="xs" c="dimmed" mt={2}>
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </Text>
              </Box>
            </Group>
          ))}
          {sending && (
            <Group align="flex-start" gap="xs">
              <Avatar color="gray" radius="xl">
                <IconRobot size={20} />
              </Avatar>
              <Box style={{ maxWidth: "calc(100% - 50px)" }}>
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
    </Paper>
  );
};

export default ChatMessages;
