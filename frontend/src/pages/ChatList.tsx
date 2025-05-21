import React from "react";
import { useNavigate } from "react-router-dom";
import { Container, Title, Text, Grid, Card, Button, Group, Stack } from "@mantine/core";
import { IconPlus, IconMessage } from "@tabler/icons-react";
import { useAppSelector } from "../store";

const ChatList: React.FC = () => {
  const navigate = useNavigate();
  const { chats, loading, error } = useAppSelector(state => state.chats);

  // Handle creating a new chat
  const handleNewChat = () => {
    navigate("/chat/new");
  };

  // Handle opening an existing chat
  const handleOpenChat = (id: string) => {
    navigate(`/chat/${id}`);
  };

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Your Chats</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={handleNewChat}>
          New Chat
        </Button>
      </Group>

      {error ? (
        <Text c="red">Error loading chats. Please try again.</Text>
      ) : chats.length === 0 ? (
        <Stack align="center" justify="center" h={300} spacing="md">
          <IconMessage size={64} opacity={0.3} />
          <Text size="lg" fw={500} ta="center">
            No chats yet
          </Text>
          <Text size="sm" c="dimmed" ta="center" maw={500}>
            Start a new conversation with an AI model by clicking the New Chat button.
          </Text>
          <Button onClick={handleNewChat} mt="md">
            Create your first chat
          </Button>
        </Stack>
      ) : (
        <Grid>
          {chats.map(chat => (
            <Grid.Col key={chat.id} span={{ base: 12, sm: 6, md: 4 }}>
              <Card
                withBorder
                padding="lg"
                radius="md"
                className="mantine-hover-effect"
                onClick={() => handleOpenChat(chat.id)}
                style={{ cursor: "pointer" }}
              >
                <Text fw={500} size="lg" mb="xs" truncate>
                  {chat.title || "Untitled Chat"}
                </Text>
                <Text size="sm" c="dimmed">
                  {new Date(chat.updatedAt).toLocaleDateString()}
                </Text>
              </Card>
            </Grid.Col>
          ))}
        </Grid>
      )}
    </Container>
  );
};

export default ChatList;
