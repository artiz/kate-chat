import React, { useState, useCallback, useRef, useEffect, use } from "react";
import {
  AppShell,
  Group,
  Title,
  Button,
  Modal,
  Badge,
  Drawer,
} from "@mantine/core";
import { IconRobot, IconSettings, IconMenu2 } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import {
  ChatMessagesContainer,
  ChatInput,
  Message,
  MessageRole,
  Model,
  parseMarkdown,
  escapeHtml,
} from "@katechat/ui";
import { DEFAULT_MODEL, SettingsForm } from "./components/SettingsForm";
import { ChatList } from "./components/ChatList";
import { OpenAIClient, ApiMode } from "./lib/openai-client";
import { useChats } from "./hooks/useChats";
import { useMessages } from "./hooks/useMessages";
import { Chat } from "./lib/db";

import "./App.scss";

export const App: React.FC = () => {
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [sidebarOpened, setSidebarOpened] = useState(false);
  const [apiKey, setApiKey] = useState(
    localStorage.getItem("openai_api_key") || "",
  );
  const [apiEndpoint, setApiEndpoint] = useState(
    localStorage.getItem("openai_api_endpoint") || "https://api.openai.com/v1",
  );
  const [apiMode, setApiMode] = useState<ApiMode>(
    (localStorage.getItem("openai_api_mode") as ApiMode) || "completions",
  );
  const [modelName, setModelName] = useState(
    localStorage.getItem("openai_model") || DEFAULT_MODEL,
  );

  const clientRef = useRef<OpenAIClient | null>(null);
  const messagesContainerRef = useRef<any>(null);

  const {
    loading,
    chats,
    createChat,
    updateChat,
    deleteChat,
    updateChatTitle,
  } = useChats();
  const { messages, addMessage, updateMessage, deleteMessages } =
    useMessages(currentChatId);

  // Initialize client when settings change
  React.useEffect(() => {
    if (apiKey && apiEndpoint) {
      clientRef.current = new OpenAIClient(apiKey, apiEndpoint, apiMode);
    }
  }, [apiKey, apiEndpoint, apiMode]);

  const handleNewChat = useCallback(async () => {
    // If current chat is empty, reuse it instead of creating a new one
    if (currentChatId && messages.length === 0) {
      setSidebarOpened(false);
      return;
    }

    const newChat = await createChat(modelName);
    setCurrentChatId(newChat.id);
    setSidebarOpened(false);
  }, [createChat, modelName, currentChatId, messages.length]);

  const handleSelectChat = useCallback((id: string) => {
    setCurrentChatId(id);
    setSidebarOpened(false);
  }, []);

  const handleDeleteChat = useCallback(
    async (id: string) => {
      await deleteChat(id);
      if (currentChatId === id) {
        setCurrentChatId(null);
      }
    },
    [deleteChat, currentChatId],
  );

  const handleTogglePin = useCallback(
    async (chat: Chat) => {
      await updateChat({ ...chat, isPinned: !chat.isPinned });
    },
    [updateChat],
  );

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || !clientRef.current) {
        if (!apiKey || !apiEndpoint) {
          notifications.show({
            title: "Configuration Required",
            message: "Please configure API settings first",
            color: "red",
          });
          setSettingsOpened(true);
        }
        return;
      }

      // Create new chat if none is selected
      let chatId = currentChatId;
      if (!chatId) {
        const newChat = await createChat(modelName);
        chatId = newChat.id;
        setCurrentChatId(chatId);
      }

      // Add user message
      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        chatId: chatId,
        content,
        html: [escapeHtml(content)],
        role: MessageRole.USER,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await addMessage(userMessage);
      setStreaming(true);

      // Prepare assistant message
      const assistantMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        chatId: chatId,
        content: "",
        role: MessageRole.ASSISTANT,
        modelName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        streaming: true,
      };

      await addMessage(assistantMessage);

      try {
        // Build conversation history
        const conversationHistory = [...messages, userMessage].map((msg) => ({
          role: msg.role === MessageRole.USER ? "user" : "assistant",
          content: msg.content,
        }));

        let fullContent = "";

        await clientRef.current.sendMessage(
          conversationHistory as any,
          modelName,
          (chunk: string) => {
            fullContent += chunk;
            const html = parseMarkdown(fullContent);
            updateMessage({
              ...assistantMessage,
              content: fullContent,
              streaming: true,
              html,
            });
          },
        );

        // Mark as completed
        const html = parseMarkdown(fullContent);
        const finalMessage = {
          ...assistantMessage,
          content: fullContent,
          streaming: false,
          html,
        };
        await updateMessage(finalMessage);

        // Generate chat title if this is the first exchange
        if (messages.length === 0) {
          try {
            const title = await clientRef.current.generateChatTitle(
              content,
              fullContent,
              modelName,
            );
            await updateChatTitle(chatId, title);
          } catch (error) {
            console.error("Failed to generate chat title:", error);
            // Don't fail the whole operation if title generation fails
          }
        }
      } catch (error: any) {
        if (error instanceof Error && error.name === "AbortError") {
          const abortMessage = "... Request was aborted.";

          const updatedMessage = {
            ...assistantMessage,
            html: assistantMessage.html
              ? assistantMessage.html.concat(abortMessage)
              : [abortMessage],
            streaming: false,
          };
          await updateMessage(updatedMessage);
        } else {
          console.error("Error sending message:", error);
          const errorMessage = {
            ...assistantMessage,
            content: `Error: ${error.message || "Failed to get response"}`,
            role: MessageRole.ERROR,
            streaming: false,
          };
          await updateMessage(errorMessage);
          notifications.show({
            title: "Error",
            message: error.message || "Failed to get response from API",
            color: "red",
          });
        }
      } finally {
        setStreaming(false);
      }
    },
    [
      messages,
      apiKey,
      apiEndpoint,
      modelName,
      currentChatId,
      createChat,
      addMessage,
      updateMessage,
      updateChatTitle,
    ],
  );

  const handleStopRequest = () => {
    if (!clientRef.current) return;
    clientRef.current.stop();
  };

  const handleSaveSettings = useCallback(
    (settings: {
      apiKey: string;
      apiEndpoint: string;
      apiMode: ApiMode;
      modelName: string;
    }) => {
      setApiKey(settings.apiKey);
      setApiEndpoint(settings.apiEndpoint);
      setApiMode(settings.apiMode);
      setModelName(settings.modelName);

      localStorage.setItem("openai_api_key", settings.apiKey);
      localStorage.setItem("openai_api_endpoint", settings.apiEndpoint);
      localStorage.setItem("openai_api_mode", settings.apiMode);
      localStorage.setItem("openai_model", settings.modelName);

      setSettingsOpened(false);

      notifications.show({
        title: "Settings Saved",
        message: "API configuration updated successfully",
        color: "green",
      });
    },
    [],
  );

  const handleAddMessage = useCallback(
    async (message: Message) => {
      await addMessage(message);
    },
    [addMessage],
  );

  const handleRemoveMessages = useCallback(
    async (args: { messagesToDelete?: Message[]; deleteAfter?: Message }) => {
      if (args.messagesToDelete) {
        const idsToDelete = args.messagesToDelete.map((m) => m.id);
        await deleteMessages(idsToDelete);
      } else if (args.deleteAfter) {
        const index = messages.findIndex((m) => m.id === args.deleteAfter?.id);
        if (index !== -1) {
          const idsToDelete = messages.slice(index + 1).map((m) => m.id);
          await deleteMessages(idsToDelete);
        }
      }
    },
    [messages, deleteMessages],
  );

  // Auto-select or create a chat on initial load
  useEffect(() => {
    if (!loading && !currentChatId) {
      if (chats.length > 0) {
        // Select the most recent chat (chats are typically sorted by updatedAt)
        setCurrentChatId(chats[0].id);
      } else {
        // Only create a new chat if there are no chats at all
        createChat(modelName).then((newChat) => {
          setCurrentChatId(newChat.id);
        });
      }
    }
  }, [loading, currentChatId, chats, modelName, createChat]);

  // Dummy models array for ChatMessagesList
  const models: Model[] = [
    {
      name: modelName,
      modelId: modelName,
    },
  ];

  const currentChat = chats.find((c) => c.id === currentChatId);

  return (
    <>
      <AppShell header={{ height: 60 }} padding="md">
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between">
            <Group>
              <Button
                variant="subtle"
                onClick={() => setSidebarOpened(true)}
                leftSection={<IconMenu2 size={18} />}
              >
                Chats
              </Button>
              <Title order={3}>
                {currentChat?.title || "OpenAI Client Demo"}
              </Title>
            </Group>
            <Group>
              <Button
                leftSection={<IconSettings size={18} />}
                onClick={() => setSettingsOpened(true)}
              >
                Settings
              </Button>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Main className="app-main">
          <div className="chat-container">
            <ChatMessagesContainer
              ref={messagesContainerRef}
              messages={messages}
              models={models}
              addChatMessage={handleAddMessage}
              removeMessages={handleRemoveMessages}
            />
            <ChatInput
              streaming={streaming}
              setSending={setStreaming}
              previousMessages={messages
                .filter((m) => m.role === MessageRole.USER)
                .map((m) => m.content)}
              onSendMessage={handleSendMessage}
              uploadAllowed={false}
              loadCompleted={true}
              promptMode={!messages.length}
              onStopRequest={handleStopRequest}
              header={
                <Group gap="md">
                  <Badge
                    color="blue"
                    leftSection={<IconRobot size={16} />}
                    size="lg"
                    radius="sm"
                  >
                    {modelName}
                  </Badge>
                </Group>
              }
            />
          </div>
        </AppShell.Main>
      </AppShell>

      <Drawer
        opened={sidebarOpened}
        onClose={() => setSidebarOpened(false)}
        title="Your Chats"
        padding="md"
        size="sm"
      >
        <ChatList
          chats={chats}
          currentChatId={currentChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onTogglePin={handleTogglePin}
        />
      </Drawer>

      <Modal
        opened={settingsOpened}
        onClose={() => setSettingsOpened(false)}
        title="API Settings"
        size="lg"
      >
        <SettingsForm
          apiKey={apiKey}
          apiEndpoint={apiEndpoint}
          apiMode={apiMode}
          modelName={modelName}
          onSave={handleSaveSettings}
        />
      </Modal>
    </>
  );
};
