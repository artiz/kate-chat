import React, { use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  Popover,
} from "@mantine/core";
import {
  IconSend,
  IconX,
  IconRobot,
  IconEdit,
  IconCheck,
  IconSettings,
  IconCircleChevronDown,
} from "@tabler/icons-react";
import { useAppSelector } from "../../store";
import { ChatMessages } from "./ChatMessages/ChatMessages";
import { ChatSettings } from "./ChatSettings";
import { FileDropzone } from "./ChatImageDropzone/ChatImageDropzone";
import { notifications } from "@mantine/notifications";
import { useChatSubscription, useChatMessages, useIntersectionObserver } from "@/hooks";

import { MAX_FILE_SIZE, MAX_IMAGES } from "@/lib/config";
import { notEmpty, ok } from "@/lib/assert";
import { ModelInfo } from "@/components/models/ModelInfo";

import { ChatDocumentsSelector } from "./ChatDocumentsSelector";

import classes from "./Chat.module.scss";
import { ModelType } from "@/store/slices/modelSlice";
import { useDocumentsUpload } from "@/hooks/useDocumentsUpload";
import { DocumentUploadProgress } from "@/components/DocumentUploadProgress";
import { ImageInput, Message, ChatDocument } from "@/types/graphql";

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
  chatId?: string;
}

export const ChatComponent = ({ chatId }: IProps) => {
  const navigate = useNavigate();
  const [userMessage, setUserMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [selectedImages, setSelectedImages] = useState<ImageInput[]>([]);

  const allModels = useAppSelector(state => state.models.models);
  const chats = useAppSelector(state => state.chats.chats);
  const { appConfig } = useAppSelector(state => state.user);

  const [showAnchorButton, setShowAnchorButton] = useState<boolean>(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const anchorTimer = useRef<NodeJS.Timeout | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const titleForm = useRef<HTMLFormElement>(null);

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

  const { uploadDocuments, uploadingDocs, uploadLoading, uploadError } = useDocumentsUpload();

  const chatDocuments = useMemo(() => {
    let docs = (chat?.chatDocuments || []).map((doc: ChatDocument) => doc.document).filter(notEmpty);
    if (uploadingDocs) {
      // If documents are uploading, include them in the list
      docs = docs.map(d => {
        const uploadNdx = uploadingDocs.findIndex(ud => ud.id === d.id);
        if (uploadNdx != -1) {
          const upload = uploadingDocs[uploadNdx];
          uploadingDocs.splice(uploadNdx, 1); // Remove from uploadingDocs to avoid duplicates
          return { ...d, ...upload };
        }

        return d;
      });

      // push new ones
      docs.push(...uploadingDocs);
    }
    return docs;
  }, [chat?.chatDocuments, uploadingDocs]);

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
      setTimeout(scrollToBottom, 200);
    }
  }, [chatId, loadCompleted]);

  // #region Scrolling
  const scrollToBottom = useCallback(() => {
    messagesContainerRef.current?.scrollTo(0, messagesContainerRef.current?.scrollHeight ?? 0);
  }, [messagesContainerRef]);

  const autoScroll = useCallback(() => {
    if (!showAnchorButton) {
      scrollToBottom();
    }
  }, [scrollToBottom, showAnchorButton]);

  useEffect(() => {
    autoScroll();
  }, [messages, chat?.lastBotMessage, autoScroll]);

  const handleScroll = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.target as HTMLDivElement;
      anchorTimer.current && clearTimeout(anchorTimer.current);

      if (scrollHeight - scrollTop - clientHeight < 2) {
        setShowAnchorButton(false);
      } else if (messages?.length) {
        if (streaming) {
          anchorTimer.current = setTimeout(() => {
            setShowAnchorButton(true);
          }, 100);
        } else {
          setShowAnchorButton(true);
        }
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

  const handleSendMessage = async () => {
    if ((!userMessage?.trim() && !selectedImages.length) || !chatId) return;
    ok(chatId, "Chat is required to send a message");
    setSending(true);

    try {
      setUserMessage("");
      setSelectedImages([]);

      // Convert images to base64
      await createMessage({
        variables: {
          input: {
            chatId,
            content: userMessage?.trim() || "",
            images: selectedImages,
            modelId: selectedModel?.modelId,
            temperature: chat?.temperature,
            maxTokens: chat?.maxTokens,
            topP: chat?.topP,
            imagesCount: chat?.imagesCount,
            documentIds: selectedDocIds,
          },
        },
      });
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
    return allModels.filter(model => model.isActive && model.type !== ModelType.EMBEDDING);
  }, [allModels]);

  const selectedModel = useMemo(() => {
    return models?.find(m => m.modelId === chat?.modelId) || null;
  }, [models, chat]);

  const handleModelChange = (modelId: string | null) => {
    const model = models.find(m => m.modelId === modelId);
    if (!model || !chatId) return;
    updateChat(chatId, { modelId: model.modelId });
  };

  const handleSettingsChange = (settings: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    imagesCount?: number;
  }) => {
    updateChat(chatId, {
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      topP: settings.topP,
      imagesCount: settings.imagesCount,
    });
  };

  const resetSettingsToDefaults = () => {
    handleSettingsChange({
      temperature: 0.7,
      maxTokens: 2000,
      topP: 0.9,
      imagesCount: 1,
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

  const handleTitleUpdate = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const title = editedTitle?.trim() || "";
      if (title && chatId) {
        updateChat(chatId, { title });
        setIsEditingTitle(false);
      }
    },
    [editedTitle, chatId, updateChat]
  );

  const handleTitleBlur = useCallback((event: React.FocusEvent<HTMLElement>) => {
    setTimeout(() => {
      setEditedTitle(chat?.title);
      setIsEditingTitle(false);
    }, 100);
  }, []);

  const handleAddFiles = useCallback(
    (files: File[]) => {
      const filesToAdd = files.filter(f => f.size < MAX_FILE_SIZE);
      if (filesToAdd.length < files.length) {
        notifications.show({
          title: "Warning",
          message: `Some files are too large and were not added (max size: ${MAX_FILE_SIZE / 1024 / 1024} MB)`,
          color: "yellow",
        });
      }

      let imageFiles = filesToAdd.filter(f => f.type?.startsWith("image/"));
      const documents = filesToAdd.filter(f => !f.type?.startsWith("image/"));

      // Limit to MAX_IMAGES
      if (imageFiles.length + selectedImages.length > MAX_IMAGES) {
        notifications.show({
          title: "Warning",
          message: `You can only add up to ${MAX_IMAGES} images at a time`,
          color: "yellow",
        });

        imageFiles = imageFiles.slice(0, MAX_IMAGES - selectedImages.length);
      }

      if (imageFiles.length) {
        Promise.all(
          imageFiles.map(file => {
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
        )
          .then(images => {
            setSelectedImages(prev => [...prev, ...images]);
          })
          .catch(error => {
            notifications.show({
              title: "Error",
              message: error.message || "Failed to read image files",
              color: "red",
            });
          });
      }

      if (documents.length) {
        if (!appConfig?.ragEnabled) {
          return notifications.show({
            title: "Warning",
            message: "RAG is not enabled. Documents will not be processed.",
            color: "yellow",
          });
        }

        ok(chatId, "Chat ID is required to upload documents");
        setUploadProgress(0);
        uploadDocuments(documents, chatId, setUploadProgress).catch(error => {
          notifications.show({
            title: "Error",
            message: error.message || "Failed to upload documents",
            color: "red",
          });
        });
      }
    },
    [selectedImages, chatId]
  );

  const uploadAllowed = useMemo(() => {
    if (appConfig?.demoMode) {
      return selectedModel?.imageInput;
    }

    return appConfig?.s3Connected;
  }, [selectedModel, appConfig]);

  return (
    <Container size="xl" py="md" className={classes.container}>
      <Group justify="space-between" mb="sm" className={classes.titleRow}>
        <Group>
          {isEditingTitle ? (
            <TextInput
              value={editedTitle}
              onChange={e => setEditedTitle(e.currentTarget.value)}
              autoFocus
              rightSection={
                <ActionIcon type="submit" size="sm" color="blue" onClick={handleTitleUpdate}>
                  <IconCheck size={16} />
                </ActionIcon>
              }
              onBlur={handleTitleBlur}
            />
          ) : (
            <Group gap="xs" className={classes.title}>
              <Title order={3}>{messagesLoading ? "Loading..." : chat.title || "Untitled Chat"}</Title>

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
          <Box className={classes.wsStatus}>
            <Box className={[classes.wsStatusIndicator, wsConnected ? classes.connected : ""].join(" ")} />
            <Text size="xs">{wsConnected ? "Connected" : "Connecting..."}</Text>
          </Box>
          <ActionIcon onClick={() => navigate("/chat")}>
            <IconX size="1.2rem" />
          </ActionIcon>
        </Group>
      </Group>

      <Group mb="sm">
        {!appConfig?.s3Connected && (
          <Alert color="yellow">S3 connection is not enabled. You cannot upload/generate images.</Alert>
        )}

        {!appConfig?.demoMode && appConfig?.ragSupported && !appConfig?.ragEnabled && (
          <Alert color="yellow">
            RAG is supported (DB is PostgreSQL/MSSQL/SQLite) but processing models are not setup. However, the
            processing models required for full functionality are not yet configured. As a result, document uploads are
            not possible at this time. To enable this feature, please select the appropriate{" "}
            <Link to="/settings#document_processing">processing models</Link>.
          </Alert>
        )}

        <DocumentUploadProgress
          error={uploadError}
          progress={uploadProgress}
          loading={uploadLoading}
          documents={uploadingDocs || []}
        />
      </Group>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className={[
          classes.messagesContainer,
          loadCompleted ? classes.loadCompleted : "",
          streaming ? classes.streaming : "",
        ].join(" ")}
      >
        <div ref={firstMessageRef} />
        {messagesLoading && (
          <Group justify="center" align="center" py="xl">
            <Loader />
          </Group>
        )}

        {messages && messages.length === 0 ? (
          <Stack align="center" justify="center" flex="1" gap="md">
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
              chatDocuments={chatDocuments}
              selectedModelName={selectedModel?.name}
              onSending={() => setSending(true)}
              onMessageDeleted={removeMessages} // Reload messages after deletion
              onMessageModelSwitch={addChatMessage}
              onCallOther={addChatMessage}
              onMessageEdit={handleEditMessage}
            />
          )}
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <div className={[classes.anchorContainer, showAnchorButton ? classes.visible : ""].join(" ")}>
          <div className={classes.anchor}>
            <IconCircleChevronDown size={32} color="teal" style={{ cursor: "pointer" }} onClick={anchorHandleClick} />
          </div>
        </div>
      </div>

      {messagesLimitReached && (
        <Tooltip label={`You have reached the limit of ${appConfig?.maxChatMessages} messages in this chat`}>
          <Text size="xs" c="red" mb="sm">
            Messages limit reached
          </Text>
        </Tooltip>
      )}

      <Group mb="sm" align="center" gap="xs" className={classes.modelRow}>
        <IconRobot size={20} />
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
        {selectedModel && <ModelInfo model={selectedModel} />}

        <Popover width={300} position="top" withArrow shadow="md">
          <Popover.Target>
            <Tooltip label="Chat Settings">
              <ActionIcon>
                <IconSettings size="1.2rem" />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <ChatSettings
              temperature={chat?.temperature}
              maxTokens={chat?.maxTokens}
              topP={chat?.topP}
              imagesCount={chat?.imagesCount}
              onSettingsChange={handleSettingsChange}
              resetToDefaults={resetSettingsToDefaults}
            />
          </Popover.Dropdown>
        </Popover>
      </Group>

      {/* Message input */}

      <div className={[classes.chatInputContainer, selectedImages.length ? classes.columned : ""].join(" ")}>
        {uploadAllowed && (
          <Group align="flex-start">
            <FileDropzone onFilesAdd={handleAddFiles} disabled={!appConfig?.s3Connected} />
            {appConfig?.ragEnabled ? (
              <ChatDocumentsSelector
                chatId={chatId}
                selectedDocIds={selectedDocIds}
                onSelectionChange={setSelectedDocIds}
                disabled={!appConfig?.s3Connected || sending || messagesLoading}
                documents={chatDocuments}
              />
            ) : null}
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
                      setSelectedImages(prev => prev.filter(f => f.fileName !== file.fileName));
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
            maxRows={7}
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
