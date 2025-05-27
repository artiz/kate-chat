import React, { use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { gql, useQuery, useMutation, useSubscription, OnDataOptions } from "@apollo/client";
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
} from "@mantine/core";
import { IconSend, IconX, IconRobot, IconEdit, IconCheck, IconPhotoAi, IconTextScan2 } from "@tabler/icons-react";
import { useAppSelector, useAppDispatch } from "../../store";
import {
  setCurrentChat,
  Chat,
  Message,
  MessageType,
  addChat,
  MessageRole,
  updateChat,
} from "../../store/slices/chatSlice";
import { ChatMessages } from "./ChatMessages/ChatMessages";
import { notifications } from "@mantine/notifications";
import { UPDATE_CHAT_MUTATION } from "../../store/services/graphql";
import { useChatSubscription } from "@/hooks/useChatSubscription";
import { parseChatMessages, parseMarkdown } from "@/lib/services/MarkdownParser";

import classes from "./Chat.module.scss";

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

  const [messages, setMessages] = useState<Message[]>([]);

  const allModels = useAppSelector(state => state.models.models);
  const [showAnchorButton, setShowAnchorButton] = useState<boolean>(false);
  const autoScrollTimer = useRef<NodeJS.Timeout | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const addChatMessage = (msg: Message) => {
    if (!msg) return;

    const addMessage = (message: Message) => {
      setMessages(prev => {
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

  // Get chat messages and chat details
  const { loading: messagesLoading, error: messagesError } = useQuery(GET_CHAT_MESSAGES, {
    variables: {
      input: {
        chatId,
        limit: 100,
        offset: 0,
      },
    },
    skip: !chatId,
    onCompleted: data => {
      const { chat: ch, messages } = data.getChatMessages || {};
      // Set chat details from the chat field in getChatMessages
      if (ch) {
        dispatch(setCurrentChat(ch));
        setChat(ch);
        setEditedTitle(ch.title || "Untitled Chat");
      }

      // Parse and set messages
      parseChatMessages(data.getChatMessages.messages || []).then(parsedMessages => {
        setMessages(parsedMessages);
      });
    },
  });

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
  const [updateChatMutation] = useMutation(UPDATE_CHAT_MUTATION, {
    onCompleted: data => {
      notifications.show({
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

  // Handle send message
  const handleSendMessage = async () => {
    if (!userMessage.trim() || !chatId) return;

    setSending(true);
    setUserMessage("");

    await sendMessageMutation({
      variables: {
        input: {
          chatId,
          content: userMessage,
          role: "user",
          modelId: selectedModel?.modelId,
        },
      },
    });
  };

  // Handle model change
  const handleModelChange = (modelId: string | null) => {
    const model = models.find(m => m.id === modelId);
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

  if (messagesError) {
    return (
      <Container size="md" py="xl">
        <Paper p="xl" withBorder>
          <Title order={2} c="red">
            Error Loading Chat
          </Title>
          <Text mt="md">{messagesError.message}</Text>
          <Button mt="xl" onClick={() => navigate("/chat")}>
            Back to Chats
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container size="md" py="md" h="calc(100vh - 120px)" style={{ display: "flex", flexDirection: "column" }}>
      <Group justify="space-between" mb="md">
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
            <Box
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: wsConnected ? "green" : "gray",
              }}
            />
            <Text size="xs">{wsConnected ? "Connected" : "Connecting..."}</Text>
          </Box>
          <ActionIcon onClick={() => navigate("/chat")}>
            <IconX size={18} />
          </ActionIcon>
        </Group>
      </Group>

      <Group mb="md" align="center">
        <IconRobot size={20} />
        <Text fw={500} size="sm">
          Model:
        </Text>
        <Select
          data={models.map(model => ({
            value: model.id,
            label: model.name,
          }))}
          searchable
          value={selectedModel?.id || ""}
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
      </Group>

      {/* Messages */}
      <Paper
        withBorder
        p="md"
        ref={messagesContainerRef}
        style={{ flexGrow: 1, overflowY: "auto", marginBottom: "1rem" }}
      >
        <ChatMessages
          messages={messages}
          isLoading={messagesLoading}
          sending={sending}
          selectedModelName={selectedModel?.name}
        />
      </Paper>

      {/* Message input */}
      <Group justify="space-between" align="flex-start">
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
