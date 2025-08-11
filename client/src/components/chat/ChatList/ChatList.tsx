import React, { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Title, Text, Grid, Card, Button, Group, Stack, Divider, Alert } from "@mantine/core";
import { IconPlus, IconMessage } from "@tabler/icons-react";
import { useAppSelector } from "@/store";
import { ChatMessagePreview } from "@/components/chat/ChatMessages/ChatMessage/ChatMessagePreview";

export const ChatList: React.FC = () => {
  const navigate = useNavigate();
  const { chats, loading, error } = useAppSelector(state => state.chats);

  const { providers } = useAppSelector(state => state.models);
  const noActiveProviders = useMemo(() => {
    return providers.length === 0 || !providers.some(provider => provider.isConnected);
  }, [providers]);

  // Handle creating a new chat or using existing pristine chat
  const handleNewChat = () => {
    navigate("/chat/new");
  };

  // Handle opening an existing chat
  const handleOpenChat = (id: string) => {
    navigate(`/chat/${id}`);
  };

  if (error) {
    return <Text c="red">Error loading chats. Please try again.</Text>;
  }

  if (noActiveProviders) {
    return (
      <Alert color="yellow" title="No Active Providers">
        <div>
          No active AI providers connected.
          <ol>
            <li>
              Please configure at least one provider on the <Link to="/settings">settings</Link> page
            </li>
            <li>
              Then fetch models on the <Link to="/models">models</Link> page
            </li>
            <li>After that, you can create a new chat</li>
          </ol>
        </div>
      </Alert>
    );
  }

  if (chats.length === 0) {
    return (
      <>
        <Group justify="space-between" mb="lg">
          <Title order={2}>Your Chats</Title>
          <Button leftSection={<IconPlus size={16} />} onClick={handleNewChat}>
            New Chat
          </Button>
        </Group>
        <Stack align="center" justify="center" h={300} gap="md">
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
      </>
    );
  }

  return (
    <>
      <Group justify="space-between" mb="lg">
        <Title order={2}>Your Chats</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={handleNewChat}>
          New Chat
        </Button>
      </Group>
      <Grid>
        {chats
          .filter(c => !c.isPristine)
          .map(chat => (
            <Grid.Col key={chat.id} span={{ base: 12, sm: 6, md: 4 }}>
              <Card withBorder padding="md" radius="md">
                <Group
                  m="0"
                  align="center"
                  justify="space-between"
                  onClick={() => handleOpenChat(chat.id)}
                  style={{ cursor: "pointer" }}
                >
                  <Text fw={500} size="lg" mb="xs" truncate>
                    {chat.title || "Untitled Chat"}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {new Date(chat.updatedAt).toLocaleDateString()}
                  </Text>
                  <Text size="sm">
                    <b>{chat.messagesCount}</b> messages
                  </Text>
                </Group>
                <Divider />

                <ChatMessagePreview html={chat.lastBotMessageHtml} text={chat.lastBotMessage} />
              </Card>
            </Grid.Col>
          ))}
      </Grid>
    </>
  );
};
