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
import { useAppSelector, useAppDispatch } from "../../store";
import { setCurrentChat, Chat, Message, MessageRole, updateChat } from "../../store/slices/chatSlice";
import { ChatMessages } from "./ChatMessages/ChatMessages";
import { ChatSettings } from "./ChatSettings";
import { notifications } from "@mantine/notifications";
import { GetChatMessagesResponse, UPDATE_CHAT_MUTATION } from "../../store/services/graphql";
import { useChatSubscription } from "@/hooks/useChatSubscription";
import { parseChatMessages, parseMarkdown } from "@/lib/services/MarkdownParser";

import classes from "./Chat.module.scss";
import { debounce } from "lodash";
import useIntersectionObserver from "@/hooks/useIntersectionObserver";

const MESSAGES_PER_PAGE = 50;

// GraphQL queries and subscriptions
const GET_CHAT_MESSAGES = gql`
  query GetChatMessages($input: GetMessagesInput!) {
    getChatMessages(input: $input) {
      messages {
        id
        content
        role
        createdAt
        modelId
        modelName
        user {
          lastName
          firstName
        }
      }
      total
      hasMore
      chat {
        id
        title
        modelId
        isPristine
        createdAt
        updatedAt
        temperature
        maxTokens
        topP
      }
    }
  }
`;

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
  const [chat, setChat] = useState<Chat>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[] | undefined>();

  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false);
  const [loadCompleted, setLoadCompleted] = useState<boolean>(false);

  const allModels = useAppSelector(state => state.models.models);
  const currentUser = useAppSelector(state => state.user.currentUser);

  const [showAnchorButton, setShowAnchorButton] = useState<boolean>(false);
  const autoScrollTimer = useRef<NodeJS.Timeout | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const client = useApolloClient();

  const addChatMessage = (msg: Message) => {
    if (!msg) return;

    const addMessage = (message: Message) => {
      setMessages(prev => {
        if (!prev) return [message]; // If no messages yet, start with this one

        const existingNdx = prev.findLastIndex(m => m.id === message.id);
        // If the last message is from the same user and has the same content, skip adding
        if (existingNdx !== -1) {
          prev[existingNdx] = message; // Update the last message instead
          return [...prev];
        } else {
          return [...prev, message];
        }
      });

      if (chat && message.role === MessageRole.ASSISTANT) {
        dispatch(
          updateChat({
            ...chat,
            lastBotMessage: message.content,
            lastBotMessageHtml: message.html,
          })
        );
      }
    };

    if (msg.content) {
      parseMarkdown(msg.content).then(html => {
        addMessage({ ...msg, html });
      });
    } else {
      addMessage(msg);
    }
  };

  const { wsConnected } = useChatSubscription({
    id: chatId,
    resetSending: () => setSending(false),
    addMessage: addChatMessage,
  });

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
    // auto-scroll to bottom when messages change
    autoScroll();
  }, [messages]);

  // Get chat messages and chat details
  const loadMessages = useCallback(
    (offset = 0) => {
      if (!chatId) return;
      setMessagesLoading(true);
      client
        .query<GetChatMessagesResponse>({
          query: GET_CHAT_MESSAGES,
          variables: {
            input: {
              chatId,
              limit: MESSAGES_PER_PAGE,
              offset,
            },
          },
        })
        .then(response => {
          const { chat: ch, messages = [], hasMore } = response.data.getChatMessages || {};
          // Set chat details from the chat field in getChatMessages
          if (ch) {
            if (ch.id !== chatId) {
              return; // If the chat ID doesn't match, do nothing
            }

            dispatch(setCurrentChat(ch));
            setChat(ch);
            setEditedTitle(ch.title || "Untitled Chat");
            setHasMoreMessages(hasMore);

            // Parse and set messages
            parseChatMessages(messages).then(parsedMessages => {
              setMessages(prev => (prev ? [...parsedMessages, ...prev] : parsedMessages));
              autoScroll();
            });

            setTimeout(() => setLoadCompleted(true), 300);
          }
        })
        .catch(error => {
          notifications.show({
            title: "Error",
            message: error.message || "Failed to load messages",
            color: "red",
          });
        })
        .finally(() => {
          setMessagesLoading(false);
        });
    },
    [chatId, autoScroll]
  );

  const loadMoreMessages = () => {
    if (!chatId || messagesLoading) return;
    if (!hasMoreMessages) return; // No more messages to load
    loadMessages(messages?.length);
  };

  useEffect(() => {
    if (!chatId) return;
    setMessages(undefined);
    setHasMoreMessages(false);
    setShowAnchorButton(false);
    setLoadCompleted(false);
    const timeout = setTimeout(() => {
      loadMessages();
    }, 200);

    return () => {
      clearTimeout(timeout);
    };
  }, [chatId]);

  const models = useMemo(() => {
    return allModels.filter(model => model.isActive);
  }, [allModels]);

  const selectedModel = useMemo(() => {
    return models?.find(m => m.modelId === chat?.modelId) || null;
  }, [models, chat]);

  // Send message mutation
  const [sendMessageMutation] = useMutation(SEND_MESSAGE, {
    onCompleted: data => {
      // Only add the user message here, the AI message will come from the subscription
      if (data.createMessage) {
        addChatMessage(data.createMessage);
      }

      // We don't clear sending state here anymore, that will happen when we receive the AI message via subscription
    },
    onError: error => {
      console.error("Error sending message:", error);
      setSending(false);
    },
  });

  // Update chat mutation (for changing the model)
  const [updateChatMutationInit] = useMutation(UPDATE_CHAT_MUTATION, {
    onCompleted: data => {
      notifications.update({
        title: "Model Changed",
        message: `Chat model has been updated`,
        color: "green",
      });
      dispatch(setCurrentChat(data.updateChat));
    },
    onError: error => {
      console.error("Error updating chat:", error);
      notifications.show({
        title: "Error",
        message: error.message || "Failed to update chat model",
        color: "red",
      });
    },
  });

  const updateChatMutation = debounce(updateChatMutationInit, 300);

  // Handle send message
  const handleSendMessage = async () => {
    if (!userMessage?.trim() || !chatId) return;

    setSending(true);
    setUserMessage("");

    await sendMessageMutation({
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

  // Handle model change
  const handleModelChange = (modelId: string | null) => {
    const model = models.find(m => m.modelId === modelId);
    if (!model || !chatId) return;

    setChat(prev =>
      prev
        ? {
            ...prev,
            modelId: model.modelId,
          }
        : undefined
    );

    // Update the chat in the database with the new model ID
    updateChatMutation({
      variables: {
        id: chatId,
        input: {
          modelId: model.modelId,
        },
      },
    });
  };

  // Handle settings change
  const handleSettingsChange = (settings: {
    temperature?: number | null;
    maxTokens?: number | null;
    topP?: number | null;
  }) => {
    setChat(prev =>
      prev
        ? {
            ...prev,
            temperature: settings.temperature ?? prev.temperature,
            maxTokens: settings.maxTokens ?? prev.maxTokens,
            topP: settings.topP ?? prev.topP,
          }
        : undefined
    );

    if (chatId) {
      updateChatMutation({
        variables: {
          id: chatId,
          input: {
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            topP: settings.topP,
          },
        },
      });
    }
  };

  // Reset settings to defaults
  const resetSettingsToDefaults = () => {
    const defaultSettings = {
      temperature: 0.7,
      maxTokens: 2000,
      topP: 0.9,
    };

    handleSettingsChange(defaultSettings);
  };

  useEffect(() => {
    if (currentUser && currentUser.defaultModelId && chat?.isPristine && currentUser.defaultModelId !== chat.modelId) {
      handleModelChange(currentUser.defaultModelId);
    }
  }, [currentUser, chat, handleModelChange]);

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
    if (hasMoreMessages) {
      loadMoreMessages();
    }
  }, [chatId, hasMoreMessages]);

  return (
    <Container size="md" py="md" className={classes.container}>
      <Group justify="space-between" mb="md" className={classes.titleRow}>
        <Group>
          {isEditingTitle ? (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (editedTitle.trim() && chatId) {
                  updateChatMutation({
                    variables: {
                      id: chatId,
                      input: {
                        title: editedTitle.trim(),
                      },
                    },
                  });
                  setIsEditingTitle(false);
                }
              }}
            >
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
            <ActionIcon onClick={() => setSettingsOpen(!settingsOpen)}>
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
          onChange={e => setUserMessage(e.currentTarget.value)}
          autosize
          minRows={1}
          maxRows={5}
          style={{ flexGrow: 1 }}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          disabled={sending || messagesLoading}
        />
        <Button onClick={handleSendMessage} disabled={!userMessage.trim() || sending || messagesLoading}>
          <IconSend size={16} /> Send
        </Button>
      </Group>
    </Container>
  );
};
