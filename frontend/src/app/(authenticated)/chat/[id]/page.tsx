"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { gql, useQuery, useMutation, useSubscription } from "@apollo/client";
import {
  Stack,
  Text,
  Paper,
  TextInput,
  Button,
  Group,
  Avatar,
  Loader,
  ScrollArea,
  Box,
  Center,
  Card,
  ActionIcon,
  Menu,
  Tooltip,
  RingProgress,
  Title,
  Mark,
} from "@mantine/core";
import {
  IconSend,
  IconRobot,
  IconUser,
  IconDots,
  IconEdit,
  IconTrash,
  IconCopy,
  IconBrandRust,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

// Define query to get chat details
const GET_CHAT_DETAILS = gql`
  query GetChatDetails($id: ID!) {
    getChatById(id: $id) {
      id
      title
      model {
        id
        name
        provider {
          name
        }
      }
      createdAt
      updatedAt
    }
  }
`;

// Define query to get chat messages
const GET_CHAT_MESSAGES = gql`
  query GetChatMessages($input: GetMessagesInput!) {
    getChatMessages(input: $input) {
      messages {
        id
        content
        role
        createdAt
        isLoading
      }
      totalCount
      hasMore
    }
  }
`;

// Define mutation to create a new message
const CREATE_MESSAGE = gql`
  mutation CreateMessage($input: CreateMessageInput!) {
    createMessage(input: $input) {
      id
      content
      role
      createdAt
      isLoading
    }
  }
`;

// Define mutation to delete a message
const DELETE_MESSAGE = gql`
  mutation DeleteMessage($id: String!) {
    deleteMessage(id: $id)
  }
`;

// Define subscription for new messages
const NEW_MESSAGE_SUBSCRIPTION = gql`
  subscription NewMessage($chatId: String!) {
    newMessage(chatId: $chatId) {
      id
      content
      role
      createdAt
      isLoading
    }
  }
`;

// Define the component
export default function ChatPage() {
  const params = useParams();
  const chatId = params.id as string;
  const [messageInput, setMessageInput] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  // Get chat details
  const {
    data: chatData,
    loading: chatLoading,
    error: chatError,
  } = useQuery(GET_CHAT_DETAILS, {
    variables: { id: chatId },
    skip: !chatId || chatId === "new",
    fetchPolicy: "cache-and-network",
  });

  // Get chat messages
  const {
    data: messagesData,
    loading: messagesLoading,
    error: messagesError,
    fetchMore,
  } = useQuery(GET_CHAT_MESSAGES, {
    variables: {
      input: {
        chatId,
        limit: 50,
        offset: 0,
        sortOrder: "ASC",
      },
    },
    skip: !chatId || chatId === "new",
    fetchPolicy: "cache-and-network",
  });

  // Subscribe to new messages
  const { data: subData } = useSubscription(NEW_MESSAGE_SUBSCRIPTION, {
    variables: { chatId },
    skip: !chatId || chatId === "new",
  });

  // Create message mutation
  const [createMessage, { loading: sending }] = useMutation(CREATE_MESSAGE, {
    onError: error => {
      notifications.show({
        title: "Error sending message",
        message: error.message,
        color: "red",
      });
    },
  });

  // Delete message mutation
  const [deleteMessage] = useMutation(DELETE_MESSAGE, {
    onCompleted: () => {
      // Refetch messages
      refetchMessages();
    },
    onError: error => {
      notifications.show({
        title: "Error deleting message",
        message: error.message,
        color: "red",
      });
    },
  });

  // Function to refetch messages
  const refetchMessages = async () => {
    try {
      await fetchMore({
        variables: {
          input: {
            chatId,
            limit: 50,
            offset: 0,
            sortOrder: "ASC",
          },
        },
        updateQuery: (_, { fetchMoreResult }) => fetchMoreResult,
      });
    } catch (error) {
      console.error("Error refetching messages:", error);
    }
  };

  // Handle subscription data
  useEffect(() => {
    if (subData?.newMessage) {
      const newMessage = subData.newMessage;
      const existingIndex = messages.findIndex(m => m.id === newMessage.id);

      if (existingIndex >= 0) {
        // Update existing message
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[existingIndex] = newMessage;
          return newMessages;
        });
      } else {
        // Add new message
        setMessages(prev => [...prev, newMessage]);
      }
    }
  }, [subData, messages]);

  // Update messages from query
  useEffect(() => {
    if (messagesData?.getChatMessages?.messages) {
      setMessages(messagesData.getChatMessages.messages);
    }
  }, [messagesData]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current && !isLoadingMore && hasScrolledToBottom) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoadingMore, hasScrolledToBottom]);

  // Set initial scroll position
  useEffect(() => {
    if (!messagesLoading && messages.length > 0 && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
      // Use setTimeout to ensure the DOM has rendered
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "auto" });
        }
      }, 100);
    }
  }, [messagesLoading, messages, hasScrolledToBottom]);

  // Handle sending a message
  const handleSendMessage = async () => {
    if (!messageInput.trim()) return;

    try {
      await createMessage({
        variables: {
          input: {
            chatId,
            content: messageInput,
            role: "user",
          },
        },
      });

      // Clear input
      setMessageInput("");
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // Handle message input keydown (for Enter key)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle loading more messages
  const handleLoadMore = async () => {
    if (!messagesData?.getChatMessages?.hasMore) return;

    setIsLoadingMore(true);

    try {
      await fetchMore({
        variables: {
          input: {
            chatId,
            limit: 50,
            offset: messages.length,
            sortOrder: "ASC",
          },
        },
        updateQuery: (prev: any, { fetchMoreResult }: any) => {
          if (!fetchMoreResult) return prev;

          return {
            getChatMessages: {
              ...fetchMoreResult.getChatMessages,
              messages: [...fetchMoreResult.getChatMessages.messages, ...prev.getChatMessages.messages],
            },
          };
        },
      });
    } catch (error) {
      console.error("Error loading more messages:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Format timestamps
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Copy message to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    notifications.show({
      title: "Copied to clipboard",
      message: "Message content has been copied to clipboard",
      color: "green",
    });
  };

  // Handle message deletion
  const handleDeleteMessage = (id: string) => {
    deleteMessage({
      variables: { id },
    });
  };

  // Loading state
  if (chatLoading) {
    return (
      <Center h="100%">
        <Loader size="xl" />
      </Center>
    );
  }

  // Error state
  if (chatError || messagesError) {
    return (
      <Center h="100%">
        <Stack align="center">
          <Text c="red" size="lg">
            Error loading chat
          </Text>
          <Text size="sm">Please try again later</Text>
        </Stack>
      </Center>
    );
  }

  // Get chat data
  const chat = chatData?.getChatById;

  return (
    <Stack h="100%" style={{ position: "relative" }} gap={0}>
      {/* Chat header */}
      <Group py="md" px="xl" style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}>
        <Avatar radius="xl" color="blue" size="md">
          <IconRobot size={22} />
        </Avatar>
        <div>
          <Text fw={600}>{chat?.title || "New Chat"}</Text>
          {chat?.model && (
            <Text size="xs" c="dimmed">
              Model: {chat.model.name} ({chat.model.provider.name})
            </Text>
          )}
        </div>
      </Group>

      {/* Messages area */}
      <ScrollArea h="calc(100vh - 180px)" offsetScrollbars scrollbarSize={6} ref={scrollAreaRef} px="md">
        {/* Load more button */}
        {messagesData?.getChatMessages?.hasMore && (
          <Center py="md">
            <Button variant="light" onClick={handleLoadMore} loading={isLoadingMore} size="xs">
              Load more messages
            </Button>
          </Center>
        )}

        {/* Messages */}
        <Stack gap="md" py="xl" px="md">
          {/* Welcome message if no messages */}
          {messages.length === 0 && !messagesLoading && (
            <Paper withBorder p="xl" radius="md" bg="var(--mantine-color-gray-0)">
              <Stack align="center" gap="md">
                <RingProgress
                  size={80}
                  thickness={4}
                  sections={[{ value: 100, color: "blue" }]}
                  label={
                    <Center>
                      <IconBrandRust size={30} style={{ color: "var(--mantine-color-blue-6)" }} />
                    </Center>
                  }
                />
                <Title order={4}>Welcome to KateChat!</Title>
                <Text ta="center" size="sm" c="dimmed" maw={400}>
                  This is a <Mark>pristine chat</Mark> where you can start a conversation with the AI. Type your message
                  below to get started.
                </Text>
              </Stack>
            </Paper>
          )}

          {/* Loading indicator for messages */}
          {messagesLoading && messages.length === 0 && (
            <Center py="xl">
              <Loader size="md" />
            </Center>
          )}

          {/* Message list */}
          {messages.map(message => (
            <Box key={message.id} w="100%">
              <Group justify={message.role === "user" ? "flex-end" : "flex-start"} wrap="nowrap" gap="sm">
                {message.role !== "user" && (
                  <Avatar radius="xl" color="blue" size="md">
                    <IconRobot size={20} />
                  </Avatar>
                )}

                <Card
                  p="sm"
                  radius="md"
                  style={{
                    maxWidth: "80%",
                    backgroundColor:
                      message.role === "user" ? "var(--mantine-color-blue-0)" : "var(--mantine-color-gray-0)",
                  }}
                  withBorder
                >
                  <Stack gap="xs">
                    {message.isLoading ? (
                      <Group>
                        <Loader size="xs" />
                        <Text size="sm">Generating response...</Text>
                      </Group>
                    ) : (
                      <>
                        <Group justify="space-between" wrap="nowrap">
                          <Text size="xs" c="dimmed">
                            {message.role === "user" ? "You" : "AI"} • {formatTimestamp(message.createdAt)}
                          </Text>

                          <Menu shadow="md" width={200} position="bottom-end">
                            <Menu.Target>
                              <ActionIcon variant="subtle" size="xs">
                                <IconDots size={14} />
                              </ActionIcon>
                            </Menu.Target>

                            <Menu.Dropdown>
                              <Menu.Item
                                leftSection={<IconCopy size={14} />}
                                onClick={() => copyToClipboard(message.content)}
                              >
                                Copy message
                              </Menu.Item>
                              {message.role === "user" && (
                                <Menu.Item
                                  leftSection={<IconTrash size={14} />}
                                  color="red"
                                  onClick={() => handleDeleteMessage(message.id)}
                                >
                                  Delete message
                                </Menu.Item>
                              )}
                            </Menu.Dropdown>
                          </Menu>
                        </Group>

                        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                          {message.content}
                        </Text>
                      </>
                    )}
                  </Stack>
                </Card>

                {message.role === "user" && (
                  <Avatar radius="xl" color="gray" size="md">
                    <IconUser size={20} />
                  </Avatar>
                )}
              </Group>
            </Box>
          ))}

          {/* Invisible element for scrolling to bottom */}
          <div ref={messagesEndRef} />
        </Stack>
      </ScrollArea>

      {/* Message input */}
      <Paper
        p="md"
        radius={0}
        style={{
          position: "sticky",
          bottom: 0,
          borderTop: "1px solid var(--mantine-color-gray-3)",
          background: "var(--mantine-color-body)",
        }}
      >
        <Group align="flex-start">
          <TextInput
            placeholder="Type your message..."
            value={messageInput}
            onChange={e => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1 }}
            disabled={sending}
            autoFocus
            radius="md"
            size="md"
          />
          <Tooltip label="Send message">
            <Button
              radius="md"
              onClick={handleSendMessage}
              disabled={!messageInput.trim()}
              loading={sending}
              variant="filled"
              size="md"
            >
              <IconSend size={16} />
            </Button>
          </Tooltip>
        </Group>
      </Paper>
    </Stack>
  );
}
