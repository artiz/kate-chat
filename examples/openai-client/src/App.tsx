import React, { useState, useCallback, useRef } from "react";
import { AppShell, Group, Title, Button, Modal, Badge } from "@mantine/core";
import { IconRobot, IconSettings } from "@tabler/icons-react";
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
import { OpenAIClient, ApiMode } from "./lib/openai-client";

import "./App.scss";

export const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [apiKey, setApiKey] = useState(
    localStorage.getItem("openai_api_key") || "",
  );
  const [apiEndpoint, setApiEndpoint] = useState(
    localStorage.getItem("openai_api_endpoint") || "https://api.openai.com/v1",
  );
  const [apiMode, setApiMode] = useState<ApiMode>(
    (localStorage.getItem("openai_api_mode") as ApiMode) || "chat",
  );
  const [modelName, setModelName] = useState(
    localStorage.getItem("openai_model") || DEFAULT_MODEL,
  );

  const clientRef = useRef<OpenAIClient | null>(null);
  const messagesContainerRef = useRef<any>(null);

  // Initialize client when settings change
  React.useEffect(() => {
    if (apiKey && apiEndpoint) {
      clientRef.current = new OpenAIClient(apiKey, apiEndpoint, apiMode);
    }
  }, [apiKey, apiEndpoint, apiMode]);

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

      // Add user message
      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        chatId: "demo-chat",
        content,
        html: [escapeHtml(content)],
        role: MessageRole.USER,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setStreaming(true);

      // Prepare assistant message
      const assistantMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        chatId: "demo-chat",
        content: "",
        role: MessageRole.ASSISTANT,
        modelName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        streaming: true,
      };

      setMessages((prev) => [...prev, assistantMessage]);

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
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== assistantMessage.id) return msg;
                const html = parseMarkdown(fullContent);
                return { ...msg, content: fullContent, streaming: true, html };
              }),
            );
          },
        );

        // Mark as completed
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id ? { ...msg, streaming: false } : msg,
          ),
        );
      } catch (error: any) {
        if (error instanceof Error && error.name === "AbortError") {
          const abortMessage = "... Request was aborted.";
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id
                ? {
                    ...msg,
                    html: msg.html
                      ? msg.html.concat(abortMessage)
                      : [abortMessage],
                    streaming: false,
                  }
                : msg,
            ),
          );
        } else {
          console.error("Error sending message:", error);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id
                ? {
                    ...msg,
                    content: `Error: ${error.message || "Failed to get response"}`,
                    role: MessageRole.ERROR,
                    streaming: false,
                  }
                : msg,
            ),
          );
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
    [messages, apiKey, apiEndpoint, modelName],
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

  const handleClearChat = useCallback(() => {
    setMessages([]);
  }, []);

  const handleAddMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const handleRemoveMessages = useCallback(
    (args: { messagesToDelete?: Message[]; deleteAfter?: Message }) => {
      if (args.messagesToDelete) {
        const idsToDelete = new Set(args.messagesToDelete.map((m) => m.id));
        setMessages((prev) => prev.filter((m) => !idsToDelete.has(m.id)));
      } else if (args.deleteAfter) {
        const index = messages.findIndex((m) => m.id === args.deleteAfter?.id);
        if (index !== -1) {
          setMessages((prev) => prev.slice(0, index + 1));
        }
      }
    },
    [messages],
  );

  // Dummy models array for ChatMessagesList
  const models: Model[] = [
    {
      name: modelName,
      modelId: modelName,
    },
  ];

  return (
    <>
      <AppShell header={{ height: 60 }} padding="md">
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between">
            <Title order={3}>OpenAI Client Demo</Title>
            <Group>
              <Button
                variant="light"
                onClick={handleClearChat}
                disabled={messages.length === 0}
              >
                Clear Chat
              </Button>
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
