import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, Textarea, Button, Group, ActionIcon, Select, Tooltip, Stack, Popover } from "@mantine/core";
import { IconSend, IconX, IconRobot, IconSettings, IconWorldSearch, IconCloudCode } from "@tabler/icons-react";
import { ChatSettings } from "./ChatSettings";
import { FileDropzone } from "../documents/FileDropzone/FileDropzone";
import { notifications } from "@mantine/notifications";

import { MAX_UPLOAD_FILE_SIZE, MAX_IMAGES } from "@/lib/config";
import { ok } from "@/lib/assert";
import { ModelInfo } from "@/components/models/ModelInfo";
import { ImageInput, ToolType, ChatTool, Document, Model } from "@/types/graphql";
import { UpdateChatInput } from "@/hooks/useChatMessages";
import { ChatDocumentsSelector } from "./ChatDocumentsSelector";
import { ChatSettingsProps, DEFAULT_CHAT_SETTINGS } from "./ChatSettings/ChatSettings";

import classes from "./ChatInput.module.scss";

interface IProps {
  chatId?: string;
  loadCompleted?: boolean;
  disabled?: boolean;
  fullHeight?: boolean;
  uploadAllowed?: boolean;
  sending: boolean;
  setSending: (value: boolean) => void;
  chatTools?: ChatTool[];
  chatSettings?: ChatSettingsProps;
  models: Model[];
  previousMessages?: string[];
  selectedModel?: Model;
  ragEnabled?: boolean;
  ragDocuments?: Document[];
  selectedRagDocIds?: string[];
  setSelectedRagDocIds?: (value: string[]) => void;

  onSendMessage: (message: string, images?: ImageInput[]) => Promise<void>;
  onUpdateChat: (chatId: string | undefined, input: UpdateChatInput, afterUpdate?: () => void) => void;
  onDocumentsUpload?: (documents: File[]) => void;
}

export const ChatInput = ({
  chatId,
  loadCompleted = false,
  disabled = false,
  fullHeight = false,
  uploadAllowed = true,
  sending,
  setSending,
  chatTools,
  chatSettings = DEFAULT_CHAT_SETTINGS,
  models,
  previousMessages = [],
  selectedModel,
  ragEnabled = false,
  ragDocuments = [],
  selectedRagDocIds,
  setSelectedRagDocIds,
  onSendMessage,
  onUpdateChat,
  onDocumentsUpload,
}: IProps) => {
  const [userMessage, setUserMessage] = useState("");
  const [selectedImages, setSelectedImages] = useState<ImageInput[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<ToolType>>(new Set());
  const [prevImageNdx, setPrevImageNdx] = useState<number>(0);
  const [isImagesSeek, setIsImagesSeek] = useState<boolean>(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    setPrevImageNdx(previousMessages?.length ? previousMessages.length - 1 : 0);
  }, [loadCompleted, previousMessages]);

  useEffect(() => {
    if (chatTools) {
      setSelectedTools(new Set(chatTools.map(tool => tool.type)));
    } else {
      setSelectedTools(new Set());
    }
  }, [chatTools]);

  const handleSendMessage = async () => {
    if ((!userMessage?.trim() && !selectedImages.length) || !chatId) return;
    ok(chatId, "Chat is required to send a message");
    setSending(true);

    try {
      setUserMessage("");
      setSelectedImages([]);
      await onSendMessage(userMessage, selectedImages);
    } catch (error) {
      notifications.show({
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to send message",
        color: "red",
      });
    } finally {
      setSending(false);
    }
  };

  const handleModelChange = (modelId: string | null) => {
    onUpdateChat(chatId, { modelId: modelId || undefined });
  };

  const handleSettingsChange = (settings: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    imagesCount?: number;
  }) => {
    onUpdateChat(chatId, {
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      topP: settings.topP,
      imagesCount: settings.imagesCount,
    });
  };

  const resetSettingsToDefaults = () => {
    handleSettingsChange(DEFAULT_CHAT_SETTINGS);
  };

  const handleToolToggle = (toolType: ToolType) => {
    if (!chatId) return;

    const tools = new Set(selectedTools);
    if (tools.has(toolType)) {
      tools.delete(toolType);
    } else {
      tools.add(toolType);
    }

    setSelectedTools(tools);
    onUpdateChat(chatId, { tools: Array.from(tools).map(type => ({ type, name: type })) });
  };

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const isEmpty = !userMessage?.trim();
      if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        handleSendMessage();
        setIsImagesSeek(false);
      } else if (event.key === "ArrowUp" && (isEmpty || isImagesSeek)) {
        const ndx = Math.max(0, prevImageNdx - 1);
        setUserMessage(previousMessages[ndx]);
        setPrevImageNdx(ndx);
        setIsImagesSeek(true);
      } else if (event.key === "ArrowDown" && (isEmpty || isImagesSeek)) {
        const ndx = Math.min(previousMessages.length - 1, prevImageNdx + 1);
        setUserMessage(previousMessages[ndx]);
        setPrevImageNdx(ndx);
        setIsImagesSeek(true);
      } else {
        setIsImagesSeek(false);
      }
    },
    [handleSendMessage, userMessage, previousMessages, prevImageNdx]
  );

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUserMessage(event.currentTarget.value);
  }, []);

  const sendMessageNotAllowed = useMemo(() => {
    return disabled || sending || (!userMessage?.trim() && !selectedImages.length);
  }, [userMessage, selectedImages, sending, disabled]);

  const handleAddFiles = useCallback(
    (files: File[]) => {
      const filesToAdd = files.filter(f => f.size < MAX_UPLOAD_FILE_SIZE);
      if (filesToAdd.length < files.length) {
        notifications.show({
          title: "Warning",
          message: `Some files are too large and were not added (max size: ${MAX_UPLOAD_FILE_SIZE / 1024 / 1024} MB)`,
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

      if (documents.length && onDocumentsUpload) {
        onDocumentsUpload(documents);
      } else if (documents.length) {
        notifications.show({
          title: "Warning",
          message: "Document upload is not available in this chat.",
          color: "orange",
        });
      }
    },
    [selectedImages, onDocumentsUpload]
  );

  const handleRemoveImage = (fileName: string): React.MouseEventHandler<HTMLButtonElement> => {
    return event => {
      event.stopPropagation();
      setSelectedImages(prev => prev.filter(f => f.fileName !== fileName));
    };
  };

  return (
    <div
      className={[
        classes.chatControlsContainer,
        fullHeight ? classes.fullHeight : "",
        loadCompleted ? "" : classes.hidden,
      ].join(" ")}
    >
      {fullHeight ? (
        <Stack align="center" justify="center" gap="md" mb="lg">
          <Text c="dimmed" size="lg" ta="center">
            Start the conversation by sending a message
          </Text>
        </Stack>
      ) : null}

      <div className={classes.chatControls}>
        <Group align="center" gap="xs" className={classes.modelRow}>
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
            size="xs"
            clearable={false}
            style={{ maxWidth: "50%" }}
            disabled={disabled || sending}
          />
          {selectedModel && <ModelInfo model={selectedModel} size="18" />}

          <Popover width={300} position="top" withArrow shadow="md">
            <Popover.Target>
              <Tooltip label="Chat Settings">
                <ActionIcon disabled={disabled || sending}>
                  <IconSettings size="1.2rem" />
                </ActionIcon>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
              <ChatSettings
                {...chatSettings}
                onSettingsChange={handleSettingsChange}
                resetToDefaults={resetSettingsToDefaults}
              />
            </Popover.Dropdown>
          </Popover>

          {/* Tool buttons */}
          {selectedModel?.tools?.includes(ToolType.WEB_SEARCH) && (
            <Tooltip label="Web Search">
              <ActionIcon
                variant={selectedTools.has(ToolType.WEB_SEARCH) ? "filled" : "default"}
                color={selectedTools.has(ToolType.WEB_SEARCH) ? "brand" : undefined}
                onClick={() => handleToolToggle(ToolType.WEB_SEARCH)}
                disabled={disabled || sending}
              >
                <IconWorldSearch size="1.2rem" />
              </ActionIcon>
            </Tooltip>
          )}

          {selectedModel?.tools?.includes(ToolType.CODE_INTERPRETER) && (
            <Tooltip label="Code Interpreter">
              <ActionIcon
                variant={selectedTools.has(ToolType.CODE_INTERPRETER) ? "filled" : "default"}
                color={selectedTools.has(ToolType.CODE_INTERPRETER) ? "brand" : undefined}
                onClick={() => handleToolToggle(ToolType.CODE_INTERPRETER)}
                disabled={disabled || sending}
              >
                <IconCloudCode size="1.2rem" />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>

        {/* Message input */}

        <div className={[classes.chatInputContainer, selectedImages.length ? classes.columned : ""].join(" ")}>
          {uploadAllowed && (
            <div className={classes.documentsInput}>
              <FileDropzone onFilesAdd={handleAddFiles} disabled={!uploadAllowed} />

              {ragEnabled ? (
                <ChatDocumentsSelector
                  chatId={chatId}
                  selectedDocIds={selectedRagDocIds}
                  onSelectionChange={setSelectedRagDocIds}
                  disabled={!uploadAllowed || disabled || sending}
                  documents={ragDocuments}
                />
              ) : null}

              <div className={classes.filesList}>
                {selectedImages.map(file => (
                  <div key={file.fileName} className={classes.previewImage}>
                    <img src={file.bytesBase64} alt={file.fileName} />
                    <ActionIcon
                      className={classes.removeButton}
                      color="red"
                      size="xs"
                      onClick={handleRemoveImage(file.fileName)}
                    >
                      <IconX size={16} />
                    </ActionIcon>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={classes.chatInputGroup}>
            <Textarea
              ref={inputRef}
              className={classes.chatInput}
              placeholder="Type your message..."
              value={userMessage || ""}
              autosize
              minRows={1}
              maxRows={7}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              disabled={disabled && !sending}
            />
            <Button onClick={handleSendMessage} disabled={sendMessageNotAllowed}>
              <IconSend size={16} /> Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
