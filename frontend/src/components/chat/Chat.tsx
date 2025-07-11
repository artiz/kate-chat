import React, { use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { gql, useMutation } from "@apollo/client";
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
  Loader,
  Stack,
  Alert,
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
  IconArrowBigRightLinesFilled,
  IconMatrix,
} from "@tabler/icons-react";
import { useAppSelector } from "../../store";
import { ChatMessages } from "./ChatMessages/ChatMessages";
import { ChatSettings } from "./ChatSettings";
import { ChatImageDropzone } from "./ChatImageDropzone/ChatImageDropzone";
import { notifications } from "@mantine/notifications";
import { useChatSubscription, useChatMessages, useIntersectionObserver } from "@/hooks";

import classes from "./Chat.module.scss";
import { ImageInput } from "@/store/services/graphql";
import { MAX_IMAGE_SIZE, MAX_IMAGES } from "@/utils/config";
import { Message } from "@/store/slices/chatSlice";
import { ok } from "@/utils/assert";

const CREATE_MESSAGE = gql`
  mutation CreateMessage($input: CreateMessageInput!) {
    createMessage(input: $input) {
      id
      content
      role
      createdAt
    }
  }
`;

interface CreateMessageResponse {
  createMessage: Message;
}

interface IProps {
  chatId: string;
}

export const ChatComponent = ({ chatId }: IProps) => {
  const navigate = useNavigate();
  const [userMessage, setUserMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedImages, setSelectedImages] = useState<ImageInput[]>([]);

  const allModels = useAppSelector(state => state.models.models);
  const chats = useAppSelector(state => state.chats.chats);
  const { appConfig } = useAppSelector(state => state.user);

  const [showAnchorButton, setShowAnchorButton] = useState<boolean>(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    messagesLoading,
    loadCompleted,
    removeMessages,
    addChatMessage,
    clearMessagesAfter,
    loadMoreMessages,
    updateChat,
    streaming,
  } = useChatMessages({
    chatId,
  });

  const chat = useMemo(() => {
    if (!chatId) return;
    return chats.find(c => c.id === chatId);
  }, [chats, chatId]);

  const { wsConnected } = useChatSubscription({
    id: chatId,
    resetSending: () => setSending(false),
    addMessage: addChatMessage,
  });

  useEffect(() => {
    setEditedTitle(chat ? chat.title || "Untitled Chat" : "");
  }, [chat]);

  useEffect(() => {
    chatInputRef.current?.focus();
  }, [loadCompleted]);

  useEffect(() => {
    if (loadCompleted) {
      setShowAnchorButton(false);
      setTimeout(scrollToBottom, 50);
    }
  }, [chatId, loadCompleted]);

  // #region Scrolling
  const scrollToBottom = useCallback(() => {
    messagesContainerRef.current?.scrollTo(0, messagesContainerRef.current?.scrollHeight ?? 0);
  }, [messagesContainerRef]);

  const autoScroll = useCallback(() => {
    if (!showAnchorButton) {
      setTimeout(scrollToBottom, 150);
    }
  }, [scrollToBottom, showAnchorButton, messagesContainerRef]);

  useEffect(() => {
    autoScroll();
  }, [messages, chat?.lastBotMessage, sending]);

  const handleScroll = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.target as HTMLDivElement;
      if (scrollHeight - scrollTop - clientHeight < 2) {
        setShowAnchorButton(false);
      } else if (messages?.length && !streaming) {
        setShowAnchorButton(true);
      }
    },
    [messages?.length, streaming]
  );

  const anchorHandleClick = useCallback(() => {
    setShowAnchorButton(false);
    scrollToBottom();
  }, [scrollToBottom]);

  const firstMessageRef = useIntersectionObserver<HTMLDivElement>(
    () => {
      loadMoreMessages();
    },
    [loadMoreMessages],
    200
  );

  // #endregion

  // #region Send message
  const [createMessage] = useMutation<CreateMessageResponse>(CREATE_MESSAGE, {
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

  useEffect(() => {
    Promise.all(
      selectedFiles
        .filter(f => f.type?.startsWith("image/"))
        .map(file => {
          return new Promise<ImageInput>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
              if (e.target?.result) {
                const bytesBase64 = e.target.result as string;
                resolve({
                  fileName: file.name,
                  mimeType: file.type,
                  bytesBase64,
                });
              } else {
                reject(new Error(`Failed to read file: ${file.name}`));
              }
            };
            reader.onerror = err => {
              reject(new Error(`Failed to read file: ${file.name}, error: ${err}`));
            };
            reader.readAsDataURL(file);
          });
        })
    ).then(images => {
      setSelectedImages(images);
    });
  }, [selectedFiles]);

  const handleSendMessage = async () => {
    if ((!userMessage?.trim() && !selectedImages.length) || !chatId) return;
    ok(chatId, "Chat is required to send a message");
    setSending(true);

    try {
      // Convert images to base64
      await createMessage({
        variables: {
          input: {
            chatId,
            content: userMessage,
            images: selectedImages,
            modelId: selectedModel?.modelId,
            temperature: chat?.temperature,
            maxTokens: chat?.maxTokens,
            topP: chat?.topP,
          },
        },
      });
      setUserMessage("");
      setSelectedFiles([]);
      setSelectedImages([]);
    } catch (error) {
      notifications.show({
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to send message",
        color: "red",
      });
      setSending(false);
    }
  };

  const handleEditMessage = async (message: Message) => {
    clearMessagesAfter(message);
    addChatMessage(message);
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

  const messagesLimitReached = useMemo(() => {
    return appConfig?.demoMode && (chat?.messagesCount ?? 0) >= (appConfig.maxChatMessages || 0);
  }, [chat, appConfig]);

  const sendMessageAllowed = useMemo(() => {
    return (!userMessage?.trim() && !selectedImages.length) || sending || messagesLoading || messagesLimitReached;
  }, [userMessage, selectedImages, sending, messagesLoading, messagesLimitReached]);

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

  const handleAddFiles = useCallback(
    (files: File[]) => {
      const filesToAdd = files.filter(f => f.size < MAX_IMAGE_SIZE);
      if (filesToAdd.length < files.length) {
        notifications.show({
          title: "Warning",
          message: `Some images were too large and were not added (max size: ${MAX_IMAGE_SIZE / 1024 / 1024} MB)`,
          color: "yellow",
        });
      }

      const allFiles = [...selectedFiles, ...filesToAdd];
      if (allFiles.length > MAX_IMAGES) {
        notifications.show({
          title: "Warning",
          message: `You can only add up to ${MAX_IMAGES} images at a time`,
          color: "yellow",
        });
      }
      // Limit to MAX_IMAGES
      setSelectedFiles(allFiles.slice(0, MAX_IMAGES));
    },
    [selectedFiles]
  );

  return (
    <Container size="xl" py="md" className={classes.container}>
      <Group justify="space-between" mb="sm" className={classes.titleRow}>
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

      <Group mb="sm" align="center" gap="xs" className={classes.modelRow}>
        <Text fw={500} size="sm" visibleFrom="sm">
          <IconRobot size={20} /> Model:
        </Text>
        <Select
          data={models.map(model => ({
            value: model.modelId,
            label: `${model.provider}: ${model.name}`,
          }))}
          searchable
          value={selectedModel?.modelId || ""}
          onChange={handleModelChange}
          placeholder="Select a model"
          size="sm"
          clearable={false}
          style={{ maxWidth: "50%" }}
          disabled={sending || messagesLoading}
        />
        {selectedModel && (
          <Group>
            {selectedModel.supportsTextIn && (
              <Tooltip label="Text input">
                <IconTextScan2 size={24} color="gray" />
              </Tooltip>
            )}

            {selectedModel.supportsEmbeddingsIn && (
              <Tooltip label="Embeddings input">
                <IconMatrix size={24} color="gray" />
              </Tooltip>
            )}
            {selectedModel.supportsImageIn && (
              <Tooltip label="Images input">
                <IconPhotoAi size={24} color="gray" />
              </Tooltip>
            )}

            <IconArrowBigRightLinesFilled size={24} color="gray" />
            {selectedModel.supportsTextOut && (
              <Tooltip label="Text generation">
                <IconTextScan2 size={24} color="teal" />
              </Tooltip>
            )}
            {selectedModel.supportsEmbeddingsOut && (
              <Tooltip label="Embeddings generation">
                <IconMatrix size={24} color="teal" />
              </Tooltip>
            )}
            {selectedModel.supportsImageOut && (
              <Tooltip label="Images generation">
                <IconPhotoAi size={24} color="teal" />
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

      {!appConfig?.s3Connected && (
        <Group mb="sm">
          <Alert color="yellow">S3 connection is not enabled. You cannot upload/generate images.</Alert>
        </Group>
      )}

      {/* Messages */}
      <Paper
        withBorder
        p="0"
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className={[
          classes.messagesContainer,
          loadCompleted ? classes.loadCompleted : "",
          streaming ? classes.streaming : "",
        ].join(" ")}
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
          {messages && (
            <ChatMessages
              messages={messages}
              sending={sending}
              selectedModelName={selectedModel?.name}
              onMessageDeleted={removeMessages} // Reload messages after deletion
              onMessageModelSwitch={addChatMessage}
              onCallOther={addChatMessage}
              onMessageEdit={handleEditMessage}
            />
          )}
        </div>
      </Paper>
      <Box style={{ position: "relative" }}>
        <div className={[classes.anchorContainer, showAnchorButton ? classes.visible : ""].join(" ")}>
          <div className={classes.anchor}>
            <IconCircleChevronDown size={32} color="teal" style={{ cursor: "pointer" }} onClick={anchorHandleClick} />
          </div>
        </div>
      </Box>

      {messagesLimitReached && (
        <Tooltip label={`You have reached the limit of ${appConfig?.maxChatMessages} messages in this chat`}>
          <Text size="xs" c="red" mb="sm">
            Messages limit reached
          </Text>
        </Tooltip>
      )}
      {/* Message input */}
      <div className={[classes.chatInputContainer, selectedFiles.length ? classes.columned : ""].join(" ")}>
        {selectedModel?.supportsImageIn && (
          <Group align="flex-start">
            <ChatImageDropzone onFilesAdd={handleAddFiles} disabled={!appConfig?.s3Connected} />
            {selectedImages.map(file => (
              <Paper key={file.fileName} className={classes.filesList}>
                <div className={classes.previewImage}>
                  <img src={file.bytesBase64} alt={file.fileName} />
                  <ActionIcon
                    className={classes.removeButton}
                    color="red"
                    size="xs"
                    onClick={e => {
                      e.stopPropagation();
                      setSelectedFiles(prev => prev.filter(f => f.name !== file.fileName));
                    }}
                  >
                    <IconX size={16} />
                  </ActionIcon>
                </div>
              </Paper>
            ))}
          </Group>
        )}

        <Group align="flex-start" className={classes.chatInputGroup}>
          <Textarea
            ref={chatInputRef}
            className={classes.chatInput}
            placeholder="Type your message..."
            value={userMessage}
            autosize
            minRows={1}
            maxRows={5}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            disabled={messagesLoading || messagesLimitReached}
          />
          <Button onClick={handleSendMessage} disabled={sendMessageAllowed}>
            <IconSend size={16} /> Send
          </Button>
        </Group>
      </div>
    </Container>
  );
};
