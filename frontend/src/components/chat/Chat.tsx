import React, { use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  gql,
  useQuery,
  useMutation,
  useSubscription,
  OnDataOptions,
  useLazyQuery,
  useApolloClient,
} from "@apollo/client";
import {
  Container,
  Paper,
  Text,
  Textarea,
  Button,
  Group,
  Title,
  Box,
  ActionIcon,
  Select,
  Tooltip,
  TextInput,
  Grid,
  Loader,
  Stack,
} from "@mantine/core";
import {
  IconSend,
  IconX,
  IconRobot,
  IconEdit,
  IconCheck,
  IconPhotoAi,
  IconTextScan2,
  IconSettings,
  IconCircleChevronDown,
} from "@tabler/icons-react";
import { debounce } from "lodash";
import { useAppSelector, useAppDispatch } from "../../store";
import { setCurrentChat } from "../../store/slices/chatSlice";
import { ChatMessages } from "./ChatMessages/ChatMessages";
import { ChatSettings } from "./ChatSettings";
import { notifications } from "@mantine/notifications";
import { useChatSubscription, useChatMessages, useIntersectionObserver } from "@/hooks";

import classes from "./Chat.module.scss";

const SEND_MESSAGE = gql`
  mutation SendMessage($input: CreateMessageInput!) {
    createMessage(input: $input) {
      id
      content
      role
      createdAt
    }
  }
`;

interface IProps {
  chatId: string | undefined;
}

export const ChatComponent = ({ chatId }: IProps) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [userMessage, setUserMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const allModels = useAppSelector(state => state.models.models);
  const currentUser = useAppSelector(state => state.user.currentUser);

  const [showAnchorButton, setShowAnchorButton] = useState<boolean>(false);
  const autoScrollTimer = useRef<NodeJS.Timeout | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const { chat, messages, messagesLoading, loadCompleted, addChatMessage, loadMoreMessages, updateChat } =
    useChatMessages({
      chatId,
    });

  const { wsConnected } = useChatSubscription({
    id: chatId,
    resetSending: () => setSending(false),
    addMessage: addChatMessage,
  });

  // #region Scrolling
  useEffect(() => {
    setShowAnchorButton(false);
  }, [chatId]);

  useEffect(() => {
    setEditedTitle(chat ? chat.title || "Untitled Chat" : "");
  }, [chat]);

  const scrollToBottom = useCallback(() => {
    autoScrollTimer.current = setTimeout(
      () => messagesContainerRef.current?.scrollTo(0, messagesContainerRef.current?.scrollHeight ?? 0),
      20
    );
  }, [messagesContainerRef]);

  const autoScroll = useCallback(() => {
    if (!showAnchorButton) {
      scrollToBottom();
    }
  }, [scrollToBottom, showAnchorButton]);

  useLayoutEffect(() => {
    autoScroll();
  }, [messages]);
  const handleScroll = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.target as HTMLDivElement;
      if (scrollHeight - scrollTop - clientHeight < 2) {
        setShowAnchorButton(false);
        if (autoScrollTimer.current) {
          clearTimeout(autoScrollTimer.current);
        }
      } else if (messages?.length) {
        setShowAnchorButton(true);
      }
    },
    [messages?.length]
  );

  const anchorHandleClick = useCallback(() => {
    setShowAnchorButton(false);
    scrollToBottom();
  }, [scrollToBottom]);

  const firstMessageRef = useIntersectionObserver<HTMLDivElement>(() => {
    loadMoreMessages();
  }, [loadMoreMessages]);

  // #endregion

  // #region Send message
  const [sendMessage] = useMutation(SEND_MESSAGE, {
    onCompleted: data => {
      if (data.createMessage) {
        addChatMessage(data.createMessage);
      }
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to send message",
        color: "red",
      });
      setSending(false);
    },
  });

  const handleSendMessage = async () => {
    if (!userMessage?.trim() || !chatId) return;
    setSending(true);
    setUserMessage("");

    await sendMessage({
      variables: {
        input: {
          chatId,
          content: userMessage,
          role: "user",
          modelId: selectedModel?.modelId,
          temperature: chat?.temperature,
          maxTokens: chat?.maxTokens,
          topP: chat?.topP,
        },
      },
    });
  };
  // #endregion

  const models = useMemo(() => {
    return allModels.filter(model => model.isActive);
  }, [allModels]);

  const selectedModel = useMemo(() => {
    return models?.find(m => m.modelId === chat?.modelId) || null;
  }, [models, chat]);

  const handleModelChange = (modelId: string | null) => {
    const model = models.find(m => m.modelId === modelId);
    if (!model || !chatId) return;
    updateChat(chatId, { modelId: model.modelId });
  };

  const handleSettingsChange = (settings: { temperature?: number; maxTokens?: number; topP?: number }) => {
    updateChat(chatId, {
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      topP: settings.topP,
    });
  };

  const resetSettingsToDefaults = () => {
    handleSettingsChange({
      temperature: 0.7,
      maxTokens: 2000,
      topP: 0.9,
    });
  };

  useEffect(() => {
    if (currentUser && currentUser.defaultModelId && chat?.isPristine && currentUser.defaultModelId !== chat.modelId) {
      handleModelChange(currentUser.defaultModelId);
    }
  }, [currentUser, chat, handleModelChange]);

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUserMessage(event.currentTarget.value);
  }, []);

  const toggleChatSettings = useCallback(() => {
    setSettingsOpen(!settingsOpen);
  }, [settingsOpen]);

  const handleTitleUpdate = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const title = editedTitle?.trim() || "";
      if (title && chatId) {
        updateChat(chatId, { title });
        setIsEditingTitle(false);
      }
    },
    [editedTitle, chatId, updateChat]
  );

  return (
    <Container size="md" py="md" className={classes.container}>
      <Group justify="space-between" mb="md" className={classes.titleRow}>
        <Group>
          {isEditingTitle ? (
            <form onSubmit={handleTitleUpdate}>
              <TextInput
                value={editedTitle}
                onChange={e => setEditedTitle(e.currentTarget.value)}
                autoFocus
                rightSection={
                  <ActionIcon type="submit" size="sm" color="blue">
                    <IconCheck size={16} />
                  </ActionIcon>
                }
                onBlur={() => setIsEditingTitle(false)}
              />
            </form>
          ) : (
            <Group gap="xs" className={classes.title}>
              <Title order={3}>{messagesLoading ? "Loading..." : editedTitle || "Untitled Chat"}</Title>

              <ActionIcon
                onClick={() => {
                  setIsEditingTitle(true);
                  setEditedTitle(editedTitle || "Untitled Chat");
                }}
                size="sm"
                variant="subtle"
                className={classes.editTitleButton}
              >
                <IconEdit size={16} />
              </ActionIcon>
            </Group>
          )}
        </Group>

        <Group>
          <Box
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              opacity: 0.7,
            }}
          >
            <Box className={[classes.wsStatusIndicator, wsConnected ? classes.connected : ""].join(" ")} />
            <Text size="xs">{wsConnected ? "Connected" : "Connecting..."}</Text>
          </Box>
          <Tooltip label="Chat Settings">
            <ActionIcon onClick={toggleChatSettings}>
              <IconSettings size={18} />
            </ActionIcon>
          </Tooltip>
          <ActionIcon onClick={() => navigate("/chat")}>
            <IconX size={18} />
          </ActionIcon>
        </Group>
      </Group>

      <Group mb="md" align="center" gap="xs" className={classes.modelRow}>
        <IconRobot size={20} />
        <Text fw={500} size="sm">
          Model:
        </Text>
        <Select
          data={models.map(model => ({
            value: model.modelId,
            label: model.name,
          }))}
          searchable
          value={selectedModel?.modelId || ""}
          onChange={handleModelChange}
          placeholder="Select a model"
          style={{ minWidth: 180 }}
          clearable={false}
          disabled={sending || messagesLoading}
        />
        {selectedModel && (
          <Group>
            <Tooltip label={`Provider: ${selectedModel.provider || "Unknown"}`}>
              <Text size="xs" c="dimmed" span>
                {selectedModel.provider}
              </Text>
            </Tooltip>
            {selectedModel.supportsImageOut && (
              <Tooltip label="Supports images generation">
                <IconPhotoAi size={32} color="teal" />
              </Tooltip>
            )}
            {selectedModel.supportsTextOut && (
              <Tooltip label="Supports text generation">
                <IconTextScan2 size={32} color="teal" />
              </Tooltip>
            )}
          </Group>
        )}

        <ChatSettings
          className={settingsOpen ? classes.chatSettings : classes.chatSettingsHidden}
          temperature={chat?.temperature}
          maxTokens={chat?.maxTokens}
          topP={chat?.topP}
          onSettingsChange={handleSettingsChange}
          resetToDefaults={resetSettingsToDefaults}
        />
      </Group>

      {/* Messages */}
      <Paper
        withBorder
        p="md"
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className={[classes.messagesContainer, loadCompleted ? classes.loadCompleted : ""].join(" ")}
      >
        <div ref={firstMessageRef}>
          {messagesLoading && (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          )}
        </div>

        {messages && messages.length === 0 ? (
          <Stack align="center" justify="center" h="100%" gap="md">
            <IconRobot size={48} opacity={0.5} />
            <Text size="lg" ta="center">
              No messages yet
            </Text>
            <Text c="dimmed" size="sm" ta="center">
              Start the conversation by sending a message
            </Text>
          </Stack>
        ) : null}

        <div className={classes.messagesList}>
          {messages && <ChatMessages messages={messages} sending={sending} selectedModelName={selectedModel?.name} />}
        </div>
      </Paper>
      <Box style={{ position: "relative" }}>
        {showAnchorButton && (
          <div className={classes.anchorContainer}>
            <div className={classes.anchor}>
              <IconCircleChevronDown size={32} color="teal" style={{ cursor: "pointer" }} onClick={anchorHandleClick} />
            </div>
          </div>
        )}
      </Box>

      {/* Message input */}
      <Group className={classes.chatInputContainer}>
        <Textarea
          placeholder="Type your message..."
          value={userMessage}
          autosize
          minRows={1}
          maxRows={5}
          style={{ flexGrow: 1 }}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          disabled={sending || messagesLoading}
        />
        <Button onClick={handleSendMessage} disabled={!userMessage?.trim() || sending || messagesLoading}>
          <IconSend size={16} /> Send
        </Button>
      </Group>
    </Container>
  );
};
