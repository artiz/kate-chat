import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { gql, useMutation } from "@apollo/client";
import {
  Container,
  Text,
  Textarea,
  Button,
  Group,
  Title,
  ActionIcon,
  Select,
  Tooltip,
  TextInput,
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
  IconWorldSearch,
  IconCloudCode,
} from "@tabler/icons-react";
import { useAppSelector } from "../../store";
import { ModelType, ChatMessagesContainer } from "@katechat/ui";
import { ChatSettings } from "./ChatSettings";
import { FileDropzone } from "../documents/FileDropzone/FileDropzone";
import { notifications } from "@mantine/notifications";
import { useChatSubscription, useChatMessages } from "@/hooks";

import { MAX_UPLOAD_FILE_SIZE, MAX_IMAGES } from "@/lib/config";
import { notEmpty, ok } from "@/lib/assert";
import { ModelInfo } from "@/components/models/ModelInfo";

import { useDocumentsUpload } from "@/hooks/useDocumentsUpload";
import { DocumentUploadProgress } from "@/components/DocumentUploadProgress";
import { ImageInput, ChatDocument, CreateMessageResponse, ToolType } from "@/types/graphql";
import { EditMessage, DeleteMessage, CallOtherModel, SwitchModel, InOutTokens } from "./plugins";
import { CREATE_MESSAGE } from "@/store/services/graphql";
import { ChatDocumentsSelector } from "./ChatDocumentsSelector";
import { RAG } from "./message-details-plugins/RAG";

import classes from "./Chat.module.scss";
import { ChatInput } from "./ChatInput";

interface IProps {
  chatId?: string;
}

export const ChatComponent = ({ chatId }: IProps) => {
  const navigate = useNavigate();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [sending, setSending] = useState(false);

  const allModels = useAppSelector(state => state.models.models);
  const chats = useAppSelector(state => state.chats.chats);
  const { appConfig } = useAppSelector(state => state.user);

  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

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

  const { wsConnected } = useChatSubscription({
    id: chatId,
    resetSending: () => setSending(false),
    addMessage: addChatMessage,
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

  useEffect(() => {
    setEditedTitle(chat?.title || "Untitled Chat");
  }, [chat?.title]);

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

  const handleSendMessage = async (message: string, images: ImageInput[] = []) => {
    if (!message?.trim() && !images.length) return;
    ok(chatId, "Chat is required to send a message");

    try {
      // Convert images to base64
      await createMessage({
        variables: {
          input: {
            chatId,
            content: message?.trim() || "",
            images,
            modelId: chat?.modelId,
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
    }
  };

  // #endregion

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

  const handleTitleBlur = useCallback(
    (event: React.FocusEvent<HTMLElement>) => {
      setTimeout(() => {
        setEditedTitle(chat?.title || "Untitled Chat");
        setIsEditingTitle(false);
      }, 100);
    },
    [chat?.title]
  );

  const isExternalChat = useMemo(() => {
    if (!chat?.user || !appConfig?.currentUser) return false;
    return chat.user.id && appConfig.currentUser.id !== chat.user.id;
  }, [chat?.user, appConfig?.currentUser]);

  const handleAddDocuments = useCallback(
    (documents: File[]) => {
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
    [chatId]
  );

  const uploadAllowed = useMemo(() => {
    if (!appConfig || !loadCompleted || isExternalChat) return false;

    if (appConfig?.demoMode) {
      return selectedModel?.imageInput;
    }

    return appConfig?.s3Connected;
  }, [selectedModel, appConfig, loadCompleted, isExternalChat]);

  return (
    <Container size="xl" py="md" className={classes.container}>
      <div className={classes.titleRow}>
        <div className={classes.titleBlock}>
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
              <Title order={4} className={classes.titleText}>
                {chat?.title || "Untitled Chat"}
              </Title>

              <ActionIcon
                onClick={() => {
                  setIsEditingTitle(true);
                  setEditedTitle(editedTitle || "Untitled Chat");
                }}
                size="md"
                variant="subtle"
                className={classes.editTitleButton}
              >
                <IconEdit size={16} />
              </ActionIcon>
            </Group>
          )}

          {isExternalChat && chat?.user ? `Owner: ${chat.user.firstName} ${chat.user.lastName}` : null}
        </div>

        <div className={classes.actionsBlock}>
          <div className={classes.wsStatus}>
            <div className={[classes.wsStatusIndicator, wsConnected ? classes.connected : ""].join(" ")} />
            <div className={classes.wsStatusText}>{wsConnected ? "Connected" : "Connecting..."}</div>
          </div>
          <ActionIcon onClick={() => navigate("/chat")}>
            <IconX size="1.2rem" />
          </ActionIcon>
        </div>
      </div>

      <Group>
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

      <ChatMessagesContainer
        messages={messages}
        models={models}
        addChatMessage={addChatMessage}
        removeMessages={removeMessages}
        loadMoreMessages={loadMoreMessages}
        plugins={[EditMessage, DeleteMessage, CallOtherModel, SwitchModel, InOutTokens]}
        detailsPlugins={[RAG(chatDocuments)]}
        streaming={streaming}
        loading={messagesLoading}
        loadCompleted={loadCompleted}
      />

      {messagesLimitReached && (
        <Tooltip label={`You have reached the limit of ${appConfig?.maxChatMessages} messages in this chat`}>
          <Text size="xs" c="red" mb="sm">
            Messages limit reached
          </Text>
        </Tooltip>
      )}

      <ChatInput
        chatId={chatId}
        loadCompleted={loadCompleted}
        disabled={isExternalChat || messagesLoading || messagesLimitReached}
        uploadAllowed={uploadAllowed}
        fullHeight={messages?.length === 0}
        sending={sending}
        setSending={setSending}
        chatTools={chat?.tools}
        chatSettings={chat}
        models={models}
        selectedModel={selectedModel}
        ragEnabled={appConfig?.ragEnabled}
        ragDocuments={chatDocuments}
        onDocumentsUpload={handleAddDocuments}
        onSendMessage={handleSendMessage}
        onUpdateChat={updateChat}
      />
    </Container>
  );
};
