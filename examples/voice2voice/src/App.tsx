import React, { useState, useEffect, useRef } from "react";
import {
  AppShell,
  Burger,
  Group,
  Stack,
  Text,
  Button,
  Title,
  Paper,
  ScrollArea,
  ActionIcon,
  Badge,
  Container,
  Box,
  LoadingOverlay,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconMicrophone,
  IconPlayerStop,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { Notifications, notifications } from "@mantine/notifications";
import { SettingsForm, DEFAULT_MODEL } from "./components/SettingsForm";
import { useChats } from "./hooks/useChats";
import { useWebRTC } from "./hooks/useWebRTC";
import { AudioVisualizer } from "./components/AudioVisualizer";
import { Chat, saveMessage, getChatMessages } from "./lib/db";
import { Message, MessageRole } from "@katechat/ui";

const App = () => {
  const [opened, { toggle }] = useDisclosure();
  const [settingsOpened, { open: openSettings, close: closeSettings }] =
    useDisclosure(false);

  // Settings state
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("openai_api_key") || "",
  );
  const [modelName, setModelName] = useState(
    () => localStorage.getItem("openai_model_name") || DEFAULT_MODEL,
  );

  // Chat state
  const {
    chats,
    createChat,
    deleteChat,
    updateChatTitle,
    loading: chatsLoading,
  } = useChats();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollViewport = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of transcript
  useEffect(() => {
    if (scrollViewport.current) {
      scrollViewport.current.scrollTo({
        top: scrollViewport.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);
  const {
    status,
    connect,
    disconnect,
    error: webrtcError,
    registerMessageHandler,
    inputAnalyser,
    outputAnalyser,
  } = useWebRTC({ apiKey, model: modelName });

  const activeChat = chats.find((c) => c.id === activeChatId);

  // Load messages for active chat
  useEffect(() => {
    if (activeChatId) {
      getChatMessages(activeChatId).then((msgs) => {
        // Sort by createdAt
        const sorted = msgs.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        setMessages(sorted);
      });
    } else {
      setMessages([]);
    }
  }, [activeChatId]);

  useEffect(() => {
    if (webrtcError) {
      notifications.show({
        title: "Connection Error",
        message: webrtcError,
        color: "red",
      });
    }
  }, [webrtcError]);

  // Handle incoming messages
  useEffect(() => {
    if (!activeChatId) return;

    const cleanup = registerMessageHandler((msg) => {
      // Handle transcriptions
      if (msg.type === "response.audio_transcript.done") {
        // Assistant said something
        const text = msg.transcript;
        const newMessage: Message = {
          id: msg.item_id || Date.now().toString(),
          role: MessageRole.ASSISTANT,
          content: text,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          chatId: activeChatId,
        };
        setMessages((prev) => [...prev, newMessage]);
        saveMessage(newMessage); // Persist
      }

      if (
        msg.type === "conversation.item.input_audio_transcription.completed"
      ) {
        // User said something
        const text = msg.transcript;
        const newMessage: Message = {
          id: msg.item_id || Date.now().toString(),
          role: MessageRole.USER,
          content: text,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          chatId: activeChatId,
        };
        setMessages((prev) => [...prev, newMessage]);
        saveMessage(newMessage); // Persist
      }
    });
    return cleanup;
  }, [registerMessageHandler, activeChatId]);

  const handleStartCall = async () => {
    if (!activeChatId) {
      // Create a new chat if none selected
      const chat = await createChat(modelName);
      setActiveChatId(chat.id);
      // Wait a bit? No, just connect.
    }
    connect();
  };

  const handleEndCall = () => {
    disconnect();
  };

  const handleSaveSettings = (newSettings: {
    apiKey: string;
    modelName: string;
  }) => {
    setApiKey(newSettings.apiKey);
    setModelName(newSettings.modelName);
    localStorage.setItem("openai_api_key", newSettings.apiKey);
    localStorage.setItem("openai_model_name", newSettings.modelName);
    closeSettings();
  };

  // Simple Chat List Sidebar
  const renderSidebar = () => (
    <Stack h="100%" p="md">
      <Group justify="space-between">
        <Title order={4}>Calls</Title>
        <ActionIcon onClick={() => createChat(modelName)} variant="light">
          +
        </ActionIcon>
      </Group>
      <ScrollArea style={{ flex: 1 }}>
        <Stack gap="xs">
          {chats.map((chat) => (
            <Paper
              key={chat.id}
              p="xs"
              withBorder
              onClick={() => {
                if (activeChatId !== chat.id) {
                  setActiveChatId(chat.id);
                  toggle(); // Close mobile menu
                }
              }}
              bg={
                activeChatId === chat.id
                  ? "var(--mantine-color-blue-light)"
                  : undefined
              }
              style={{ cursor: "pointer" }}
            >
              <Group justify="space-between">
                <Text size="sm" truncate>
                  {chat.title}
                </Text>
                <ActionIcon
                  size="xs"
                  color="red"
                  variant="subtle"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(chat.id);
                    if (activeChatId === chat.id) setActiveChatId(null);
                  }}
                >
                  <IconTrash size={12} />
                </ActionIcon>
              </Group>
              <Text size="xs" c="dimmed">
                {new Date(chat.createdAt).toLocaleTimeString()}
              </Text>
            </Paper>
          ))}
        </Stack>
      </ScrollArea>
      <Button
        variant="light"
        leftSection={<IconSettings size={16} />}
        onClick={openSettings}
      >
        Settings
      </Button>
    </Stack>
  );

  if (!apiKey && !settingsOpened) {
    // Force settings open if no key
    return (
      <Container size="xs" mt="xl">
        <Paper p="xl" withBorder shadow="sm">
          <Title order={3} mb="md">
            Welcome to Voice2Voice
          </Title>
          <SettingsForm
            apiKey={apiKey}
            apiEndpoint="https://api.openai.com/v1"
            modelName={modelName}
            onSave={handleSaveSettings}
          />
        </Paper>
      </Container>
    );
  }

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          <Title order={3}>Voice2Voice Demo</Title>
          {status === "connected" && <Badge color="green">Live</Badge>}
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">{renderSidebar()}</AppShell.Navbar>

      <AppShell.Main>
        {settingsOpened ? (
          <Container size="sm">
            <Title order={3} mb="md">
              Settings
            </Title>
            <SettingsForm
              apiKey={apiKey}
              apiEndpoint="https://api.openai.com/v1"
              modelName={modelName}
              onSave={handleSaveSettings}
            />
            <Button variant="subtle" mt="sm" onClick={closeSettings}>
              Cancel
            </Button>
          </Container>
        ) : (
          <Stack h="calc(100vh - 100px)" justify="space-between">
            {/* Visualizer Area */}
            <Box
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f8f9fa",
                borderRadius: "8px",
                position: "relative",
              }}
            >
              {status === "connected" ? (
                <>
                  <AudioVisualizer
                    inputAnalyser={inputAnalyser}
                    outputAnalyser={outputAnalyser}
                    width={600}
                    height={200}
                  />
                  <Text c="dimmed" mt="md">
                    Speaking with {modelName}
                  </Text>
                </>
              ) : (
                <Text c="dimmed">Ready to start conversation</Text>
              )}
            </Box>

            {/* Controls */}
            <Group justify="center" p="xl">
              {status !== "connected" ? (
                <Button
                  size="xl"
                  radius="xl"
                  color="blue"
                  leftSection={<IconMicrophone />}
                  onClick={handleStartCall}
                  loading={status === "connecting"}
                >
                  Start Call
                </Button>
              ) : (
                <Button
                  size="xl"
                  radius="xl"
                  color="red"
                  leftSection={<IconPlayerStop />}
                  onClick={handleEndCall}
                >
                  End Call
                </Button>
              )}
            </Group>

            {/* Transcripts (Optional, maybe collapsible) */}
            <Paper
              withBorder
              p="md"
              style={{
                maxHeight: "75vh",
                overflowY: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Title order={6} mb="xs">
                Transcript
              </Title>
              <ScrollArea viewportRef={scrollViewport} style={{ flex: 1 }}>
                {messages.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No messages yet.
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {messages.map((msg, i) => (
                      <Group key={msg.id} align="flex-start">
                        <Badge
                          size="sm"
                          color={
                            msg.role === MessageRole.USER ? "blue" : "orange"
                          }
                        >
                          {msg.role}
                        </Badge>
                        <Text size="sm">{msg.content}</Text>
                      </Group>
                    ))}
                  </Stack>
                )}
              </ScrollArea>
            </Paper>
          </Stack>
        )}
      </AppShell.Main>
    </AppShell>
  );
};

export { App };
