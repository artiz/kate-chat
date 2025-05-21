import React, { use, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
} from "@mantine/core";
import { IconSend, IconX, IconRobot } from "@tabler/icons-react";
import { useAppSelector, useAppDispatch } from "../store";
import { setMessages, setCurrentChat, Message, MessageType } from "../store/slices/chatSlice";
import { setSelectedModel } from "../store/slices/modelSlice";
import ChatMessages from "../components/ChatMessages";
import { notifications } from "@mantine/notifications";
import { UPDATE_CHAT_MUTATION } from "../store/services/graphql";
import { useChatSubscription } from "@/hooks/useChatSubscription";
import { parseMessages } from "@/lib/services/MarkdownParser";

// GraphQL queries and subscriptions

const GET_CHAT = gql`
  query GetChat($id: ID!) {
    getChatById(id: $id) {
      id
      title
      modelId
      isPristine
      createdAt
      updatedAt
    }
  }
`;

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
      }
      total
      hasMore
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

const Chat: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);
    

    const selectedModel = useAppSelector(state => state.models.selectedModel);
    const models = useAppSelector(state => state.models.models);
    const messages = useAppSelector(state => state.chats.messages);
    const [showAnchorButton, setShowAnchorButton] = useState<boolean>(false);
    const autoScrollTimer = useRef<NodeJS.Timeout | null>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    const { wsConnected, addChatMessage } = useChatSubscription(id, () => setSending(false));
 
    // Get chat details
    const {
        data: chatData,
        loading: chatLoading,
        error: chatError,
    } = useQuery(GET_CHAT, {
        variables: { id },
        skip: !id,
        onCompleted: data => {
            dispatch(setCurrentChat(data.getChatById));

            // If the chat has a model selected, use that model
            if (data.getChatById?.modelId) {
                const chatModel = models.find(model => model.modelId === data.getChatById.modelId);
                if (chatModel) {
                    dispatch(setSelectedModel(chatModel));
                }
            }
        },
    });

    // Get chat messages
    const { loading: messagesLoading, error: messagesError } = useQuery(GET_CHAT_MESSAGES, {
        variables: {
            input: {
                chatId: id,
                limit: 100,
                offset: 0,
            },
        },
        skip: !id,
        onCompleted: data => {
            parseMessages(data.getChatMessages.messages || []).then(parsedMessages => {
                dispatch(setMessages(parsedMessages));
            });
        },
    });

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
        if (!message.trim() || !id) return;

        setSending(true);
        setMessage("");

        await sendMessageMutation({
            variables: {
                input: {
                    chatId: id,
                    content: message,
                    role: "user",
                    modelId: selectedModel?.modelId,
                },
            },
        });
    };

    // Handle model change
    const handleModelChange = (modelId: string | null) => {
        const model = models.find(m => m.id === modelId);
        if (!model || !id) return;
        dispatch(setSelectedModel(model));
        // Update the chat in the database with the new model ID
        updateChatMutation({
            variables: {
                id,
                input: {
                    modelId: model.modelId,
                },
            },
        });
    };

    const scrollToBottom = useCallback(() => {
        autoScrollTimer.current = setTimeout(
            () => messagesContainerRef.current?.scrollTo(0, messagesContainerRef.current?.scrollHeight ?? 0),
            20,
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

    // Loading state
    const isLoading = chatLoading || messagesLoading;
    const error = chatError || messagesError;

    if (error) {
        return (
            <Container size="md" py="xl">
                <Paper p="xl" withBorder>
                    <Title order={2} c="red">
                        Error Loading Chat
                    </Title>
                    <Text mt="md">{error.message}</Text>
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
                    <Title order={3}>{isLoading ? "Loading..." : chatData?.getChatById?.title || "Untitled Chat"}</Title>
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
                    value={selectedModel?.id || ""}
                    onChange={handleModelChange}
                    placeholder="Select a model"
                    style={{ minWidth: 180 }}
                    clearable={false}
                    disabled={sending || isLoading}
                />
                {selectedModel && (
                    <Tooltip label={`Provider: ${selectedModel.provider || "Unknown"}`}>
                        <Text size="xs" c="dimmed" span>
                            {selectedModel.provider}
                        </Text>
                    </Tooltip>
                )}
            </Group>

            {/* Messages */}
            <Paper withBorder p="md" ref={messagesContainerRef} style={{ flexGrow: 1, overflowY: "auto", marginBottom: "1rem" }}>
                <ChatMessages
                    messages={messages}
                    isLoading={isLoading}
                    sending={sending}
                    selectedModelName={selectedModel?.name}
                />
            </Paper>

            {/* Message input */}
            <Group justify="space-between" align="flex-start">
                <Textarea
                    placeholder="Type your message..."
                    value={message}
                    onChange={e => setMessage(e.currentTarget.value)}
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
                    disabled={sending || isLoading}
                />
                <Button onClick={handleSendMessage} disabled={!message.trim() || sending || isLoading}>
                    <IconSend size={16} /> Send
                </Button>
            </Group>
        </Container>
    );
};

export default Chat;
