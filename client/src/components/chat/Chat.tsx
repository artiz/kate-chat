import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { Container, Text, Group, Title, ActionIcon, Tooltip, TextInput, Alert, Stack } from "@mantine/core";
import { IconEdit, IconCheck, IconArrowLeft, IconBrand4chan, IconAi } from "@tabler/icons-react";
import { useAppSelector } from "@/store";
import {
  assert,
  ModelType,
  ChatMessagesContainer,
  ChatMessagesContainerRef,
  MessageRole,
  ImageInput,
  ChatInput,
  ChatInputRef,
  DropFilesOverlay,
} from "@katechat/ui";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useChatSubscription, useChatMessages } from "@/hooks";

import { useDocumentsUpload } from "@/hooks/useDocumentsUpload";
import { DocumentUploadProgress } from "@/components/DocumentUploadProgress";
import {
  ChatDocument,
  CreateMessageResponse,
  ModelFeature,
  StopMessageGenerationResponse,
  StopMessageGenerationInput,
} from "@/types/graphql";
import { EditMessage, DeleteMessage, CallOtherModel, SwitchModel, InOutTokens } from "./plugins";
import { CREATE_MESSAGE, STOP_MESSAGE_GENERATION_MUTATION } from "@/store/services/graphql.queries";
import { MAX_UPLOAD_FILE_SIZE, MAX_IMAGES, SUPPORTED_UPLOAD_FORMATS } from "@/lib/config";
import { RAG } from "./message-details-plugins/RAG";
import { CodeInterpreterCall } from "./message-details-plugins/CodeInterpreter";
import { WebSearchCall } from "./message-details-plugins/WebSearch";
import { MCPCall } from "./message-details-plugins/MCP";
import { useCodePlugins } from "./code-plugins";
import { ChatInputHeader } from "./ChatInputHeader";
import { ChatDocumentsSelector } from "./input-plugins/ChatDocumentsSelector";
import { getChatMcpTokens } from "../auth/McpAuthentication";
import { ChatPluginsContextProvider } from "./ChatPluginsContext";
import { getClientConfig } from "@/global-config";

import classes from "./Chat.module.scss";

interface IProps {
  chatId?: string;
}

export const ChatComponent = ({ chatId }: IProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const { codePlugins, PythonCodeModal } = useCodePlugins();
  const [editedTitle, setEditedTitle] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [sending, setSending] = useState(false);

  const chatMessagesRef = useRef<ChatMessagesContainerRef>(null);
  const chatInputRef = useRef<ChatInputRef>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const allModels = useAppSelector(state => state.models.models);
  const chats = useAppSelector(state => state.chats.chats);
  const { appConfig } = useAppSelector(state => state.user);
  const { aiUsageAlert } = getClientConfig();

  const [selectedRagDocIds, setSelectedRagDocIds] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const {
    messages,
    messagesLoading,
    loadCompleted,
    removeMessages,
    addChatMessage,
    loadMoreMessages,
    updateChat,
    streaming,
  } = useChatMessages({
    chatId,
  });

  const { wsConnected, messageMetadata } = useChatSubscription({
    id: chatId,
    resetSending: () => setSending(false),
    addMessage: addChatMessage,
  });

  const chat = useMemo(() => {
    if (!chatId) return;
    return chats.find(c => c.id === chatId);
  }, [chats, chatId]);

  useEffect(() => {
    if (!chatId) return;

    if (loadCompleted && !appConfig?.s3Connected) {
      notifications.show({
        title: t("common.warning"),
        message: t("chat.s3NotEnabled"),
        color: "yellow",
      });
    }
    setSelectedRagDocIds([]);
  }, [chatId, loadCompleted]);

  const { uploadDocuments, uploadingDocs, uploadLoading, uploadError } = useDocumentsUpload();

  const mcpTokens = useMemo(() => {
    return getChatMcpTokens(chat?.tools);
  }, [chat?.tools]);

  const chatDocuments = useMemo(() => {
    let docs = (chat?.chatDocuments || []).map((doc: ChatDocument) => doc.document).filter(assert.notEmpty);
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

  const handleAutoScroll = useCallback((enabled: boolean) => {
    setAutoScroll(enabled);
    if (enabled) {
      chatMessagesRef.current?.scrollToBottom();
    }
  }, []);

  // #region Send message
  const [createMessage] = useMutation<CreateMessageResponse>(CREATE_MESSAGE, {
    onCompleted: data => {
      if (data.createMessage) {
        addChatMessage(data.createMessage);
      }
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("chat.failedToSend"),
        color: "red",
      });
      setSending(false);
    },
  });

  const [stopMessageGeneration, { loading: stopping }] = useMutation<
    StopMessageGenerationResponse,
    { input: StopMessageGenerationInput }
  >(STOP_MESSAGE_GENERATION_MUTATION, {
    onCompleted: data => {
      if (data.stopMessageGeneration.error) {
        notifications.show({
          title: t("common.error"),
          message: data.stopMessageGeneration.error,
          color: "red",
        });
      }
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || "Failed to stop message generation",
        color: "red",
      });
    },
  });

  const handleSendMessage = async (message: string, images: ImageInput[] = []) => {
    if (!message?.trim() && !images.length) return;
    assert.ok(chatId, "Chat is required to send a message");

    try {
      // Collect MCP auth tokens for enabled MCP tools
      await createMessage({
        variables: {
          input: {
            chatId,
            content: message?.trim() || "",
            images,
            documentIds: selectedRagDocIds,
            mcpTokens,
          },
        },
      });

      // Scroll chat to bottom after sending message
      if (autoScroll) {
        setTimeout(() => {
          chatMessagesRef.current?.scrollToBottom();
        }, 250);
      }
    } catch (error) {
      notifications.show({
        title: t("common.error"),
        message: error instanceof Error ? error.message : t("chat.failedToSend"),
        color: "red",
      });
    }
  };

  const handleStopRequest = useCallback(async () => {
    if (!messageMetadata?.requestId) {
      return notifications.show({
        title: t("common.error"),
        message: t("chat.noRequestId"),
        color: "red",
      });
    }

    // Find the assistant message that's currently being generated
    const message = messages?.findLast(
      msg => msg.role === MessageRole.ASSISTANT && msg.metadata?.requestId === messageMetadata.requestId
    );

    if (!message?.id) {
      return notifications.show({
        title: t("common.error"),
        message: t("chat.noMessageToStop"),
        color: "red",
      });
    }

    try {
      await stopMessageGeneration({
        variables: {
          input: {
            requestId: messageMetadata.requestId,
            messageId: message.id,
          },
        },
      });
    } catch (error) {
      console.error("Error stopping message generation:", error);
    }
  }, [messageMetadata, messages, stopMessageGeneration]); // #endregion

  const models = useMemo(() => {
    return allModels.filter(model => model.isActive && model.type !== ModelType.EMBEDDING);
  }, [allModels]);

  const selectedModel = useMemo(() => {
    return (
      allModels?.find(m => m.modelId === chat?.modelId) ||
      allModels?.find(m => m.modelId === appConfig?.currentUser?.defaultModelId) ||
      models?.[0]
    );
  }, [allModels, models, chat]);

  const messagesLimitReached = useMemo(() => {
    return appConfig?.demoMode && (chat?.messagesCount ?? 0) >= (appConfig.maxChatMessages || 0);
  }, [chat, appConfig]);

  const handleTitleUpdate = useCallback(() => {
    const title = editedTitle?.trim() || "";
    if (title && chatId) {
      updateChat(chatId, { title });
      setIsEditingTitle(false);
    }
  }, [editedTitle, chatId, updateChat]);

  const handleTitleBlur = useCallback(
    (event: React.FocusEvent<HTMLElement>) => {
      setTimeout(() => setIsEditingTitle(false), 100);
    },
    [chat?.title]
  );

  const handleEditTitleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleTitleUpdate();
    } else if (e.key === "Escape") {
      setIsEditingTitle(false);
    }
  };

  const handleTitleEdit = useCallback(() => {
    setIsEditingTitle(true);
    setEditedTitle(chat?.title || t("chat.untitledChat"));
    setTimeout(() => {
      titleRef.current?.focus();
    }, 0);
  }, [chat?.title]);

  const isExternalChat = useMemo(() => {
    if (!chat?.user || !appConfig?.currentUser) return false;
    return chat.user.id && appConfig.currentUser.id !== chat.user.id;
  }, [chat?.user, appConfig?.currentUser]);

  const handleAddDocuments = useCallback(
    (documents: File[]) => {
      if (documents.length) {
        if (!appConfig?.ragEnabled) {
          return notifications.show({
            title: t("common.warning"),
            message: t("chat.ragNotEnabled"),
            color: "yellow",
          });
        }

        assert.ok(chatId, "Chat ID is required to upload documents");
        setUploadProgress(0);
        uploadDocuments(documents, chatId, setUploadProgress).catch(error => {
          notifications.show({
            title: t("common.error"),
            message: error.message || t("chat.failedToUploadDocs"),
            color: "red",
          });
        });
      }
    },
    [chatId]
  );

  const uploadAllowed = useMemo(() => {
    if (!appConfig || !loadCompleted || isExternalChat) return false;
    return appConfig?.ragEnabled || selectedModel?.imageInput;
  }, [selectedModel, appConfig, loadCompleted, isExternalChat]);

  const maxImagesAllowed = useMemo(() => {
    if (!selectedModel?.imageInput) return 0;
    if (typeof appConfig?.maxImages === "number" && appConfig.maxImages >= 0) {
      return appConfig.maxImages;
    }
    return MAX_IMAGES;
  }, [appConfig?.maxImages, selectedModel?.imageInput]);

  const requestStoppable = useMemo(() => {
    return (
      !stopping && messageMetadata?.requestId && selectedModel?.features?.includes(ModelFeature.REQUEST_CANCELLATION)
    );
  }, [selectedModel, stopping, messageMetadata?.requestId]);

  const handleDragOver = useCallback((ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    if (ev.dataTransfer.types?.includes("Files")) {
      ev.dataTransfer.dropEffect = "copy";
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    if (ev.target === ev.currentTarget) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (ev: React.DragEvent<HTMLDivElement>) => {
      ev.preventDefault();
      ev.stopPropagation();
      setIsDragging(false);
      const files =
        ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length > 0
          ? Array.from(ev.dataTransfer.files).filter(f => f.size > 0)
          : [];
      if (files.length && chatInputRef.current) {
        chatInputRef.current.handleAddFiles(files);
      }
    },
    [chatInputRef]
  );

  return (
    <Container
      size="xl"
      py="md"
      className={[classes.container, messages?.length === 0 ? classes.promptMode : ""].join(" ")}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <DropFilesOverlay
        visible={isDragging}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />
      <div className={classes.titleRow}>
        {chat?.isPristine ? (
          <div />
        ) : (
          <div className={classes.titleBlock}>
            {isEditingTitle ? (
              <TextInput
                value={editedTitle}
                onChange={e => setEditedTitle(e.currentTarget.value)}
                onKeyUp={handleEditTitleKeyUp}
                rightSection={
                  <ActionIcon type="submit" size="sm" color="blue" onClick={handleTitleUpdate}>
                    <IconCheck size={16} />
                  </ActionIcon>
                }
                onBlur={handleTitleBlur}
                ref={titleRef}
              />
            ) : (
              <Group gap="xs" className={classes.title}>
                <Title order={4} className={classes.titleText}>
                  {chat?.title || t("chat.untitledChat")}
                </Title>

                <ActionIcon onClick={handleTitleEdit} size="md" variant="subtle" className={classes.editTitleButton}>
                  <IconEdit size={16} />
                </ActionIcon>
              </Group>
            )}

            {isExternalChat && chat?.user ? `Owner: ${chat.user.firstName} ${chat.user.lastName}` : null}
          </div>
        )}

        <div className={classes.actionsBlock}>
          <div className={classes.wsStatus}>
            <div className={[classes.wsStatusIndicator, wsConnected ? classes.connected : ""].join(" ")} />
            <div className={classes.wsStatusText}>{wsConnected ? t("chat.connected") : t("chat.connecting")}</div>
          </div>
          <Tooltip label={t("chat.backToChats")}>
            <ActionIcon onClick={() => navigate("/chat")}>
              <IconArrowLeft size="1.2rem" />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
      <Stack justify="stretch" align="center">
        {!appConfig?.demoMode && appConfig?.ragSupported && !appConfig?.ragEnabled && (
          <Alert color="yellow">
            {t("chat.ragNotConfigured")}
            <br />
            <Link to="/ai-settings">{t("aiSettings.title")}</Link>.
          </Alert>
        )}

        <DocumentUploadProgress
          error={uploadError}
          progress={uploadProgress}
          loading={uploadLoading}
          documents={uploadingDocs || []}
        />
      </Stack>

      <ChatPluginsContextProvider context={{ mcpTokens }}>
        <ChatMessagesContainer
          ref={chatMessagesRef}
          messages={messages}
          models={models}
          autoScroll={autoScroll}
          addChatMessage={addChatMessage}
          removeMessages={removeMessages}
          loadMoreMessages={loadMoreMessages}
          plugins={[EditMessage, DeleteMessage, CallOtherModel, SwitchModel, InOutTokens]}
          detailsPlugins={[RAG(chatDocuments), CodeInterpreterCall, WebSearchCall, MCPCall]}
          codePlugins={codePlugins}
          streaming={streaming}
          loading={messagesLoading}
          loadCompleted={loadCompleted}
        />
      </ChatPluginsContextProvider>
      {messagesLimitReached && (
        <Tooltip label={t("chat.messagesLimitReached", { limit: appConfig?.maxChatMessages })}>
          <Text size="xs" c="red" mb="sm">
            Messages limit reached
          </Text>
        </Tooltip>
      )}

      <ChatInput
        ref={chatInputRef}
        loadCompleted={loadCompleted}
        disabled={isExternalChat || messagesLoading || messagesLimitReached || sending}
        uploadAllowed={uploadAllowed}
        promptMode={messages?.length === 0}
        streaming={streaming}
        setSending={setSending}
        previousMessages={messages?.filter(m => m.role === MessageRole.USER).map(m => m.content)}
        header={
          <ChatInputHeader
            chatId={chatId}
            disabled={isExternalChat || messagesLoading || messagesLimitReached || sending}
            streaming={streaming}
            chatTools={chat?.tools}
            chatSettings={chat}
            models={models}
            selectedModel={selectedModel}
            onUpdateChat={updateChat}
            onAutoScroll={handleAutoScroll}
          />
        }
        inputPlugins={
          <>
            {appConfig?.ragEnabled && (
              <ChatDocumentsSelector
                chatId={chatId}
                selectedDocIds={selectedRagDocIds}
                onSelectionChange={setSelectedRagDocIds}
                disabled={!uploadAllowed || isExternalChat || messagesLoading}
                documents={chatDocuments}
              />
            )}
          </>
        }
        uploadFormats={SUPPORTED_UPLOAD_FORMATS}
        maxImagesCount={maxImagesAllowed}
        maxUploadFileSize={MAX_UPLOAD_FILE_SIZE}
        onDocumentsUpload={handleAddDocuments}
        onSendMessage={handleSendMessage}
        onStopRequest={requestStoppable ? handleStopRequest : undefined}
      />

      {aiUsageAlert && loadCompleted && messages?.length ? (
        <Group justify="center" c="dimmed" p="0">
          <IconAi size="20" />
          <Text size="xs" mt="0" mb="0" ta="center">
            {t(aiUsageAlert)}
          </Text>
        </Group>
      ) : null}

      {PythonCodeModal}
    </Container>
  );
};
