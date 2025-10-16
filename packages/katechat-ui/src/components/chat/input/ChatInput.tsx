import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, Textarea, Button, Group, ActionIcon, Stack } from "@mantine/core";
import { IconPlayerStop, IconPlayerStopFilled, IconSend, IconX } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { ImageInput } from "@/core";
import { FileDropzone } from "@/controls";

import classes from "./ChatInput.module.scss";

interface IProps {
  chatId?: string;
  loadCompleted?: boolean;
  disabled?: boolean;
  promptMode?: boolean;
  uploadAllowed?: boolean;
  streaming: boolean;
  setSending: (value: boolean) => void;
  previousMessages?: string[];
  header?: React.ReactNode;
  inputPlugins?: React.ReactNode;

  uploadFormats?: string[];
  maxUploadFileSize?: number;
  maxImagesCount?: number;

  onSendMessage: (message: string, images?: ImageInput[]) => Promise<void>;
  onStopRequest?: () => void;
  onDocumentsUpload?: (documents: File[]) => void;
}

export const ChatInput = ({
  loadCompleted = false,
  disabled = false,
  promptMode = false,
  uploadAllowed = true,
  streaming,
  setSending,
  previousMessages = [],
  header,
  inputPlugins,
  uploadFormats,
  maxUploadFileSize = 64 * 1024 * 1024,
  maxImagesCount = 5,
  onSendMessage,
  onStopRequest,
  onDocumentsUpload,
}: IProps) => {
  const [userMessage, setUserMessage] = useState("");
  const [selectedImages, setSelectedImages] = useState<ImageInput[]>([]);
  const [prevImageNdx, setPrevImageNdx] = useState<number>(0);
  const [isImagesSeek, setIsImagesSeek] = useState<boolean>(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    setPrevImageNdx(previousMessages?.length ? previousMessages.length : 0);
  }, [loadCompleted, previousMessages]);

  const handleSendMessage = async () => {
    if (!userMessage?.trim() && !selectedImages.length) return;
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
    return disabled || streaming || (!userMessage?.trim() && !selectedImages.length);
  }, [userMessage, selectedImages, streaming, disabled]);

  const handleAddFiles = useCallback(
    (files: File[]) => {
      const filesToAdd = files.filter(f => f.size < maxUploadFileSize);
      if (filesToAdd.length < files.length) {
        notifications.show({
          title: "Warning",
          message: `Some files are too large and were not added (max size: ${maxUploadFileSize / 1024 / 1024} MB)`,
          color: "yellow",
        });
      }

      let imageFiles = filesToAdd.filter(f => f.type?.startsWith("image/"));
      const documents = filesToAdd.filter(f => !f.type?.startsWith("image/"));

      // Limit images
      if (imageFiles.length + selectedImages.length > maxImagesCount) {
        notifications.show({
          title: "Warning",
          message: `You can only add up to ${maxImagesCount} images at a time`,
          color: "yellow",
        });

        imageFiles = imageFiles.slice(0, maxImagesCount - selectedImages.length);
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
        promptMode ? classes.promptMode : "",
        loadCompleted ? "" : classes.hidden,
      ].join(" ")}
    >
      {promptMode ? (
        <Stack align="center" justify="center" gap="md" mb="lg">
          <Text c="dimmed" size="lg" ta="center">
            Start the conversation by sending a message
          </Text>
        </Stack>
      ) : null}

      <div className={classes.chatControls}>
        {header && (
          <Group align="center" gap="xs" className={classes.headerRow}>
            {header}
          </Group>
        )}

        <div className={[classes.chatInputContainer, selectedImages.length ? classes.columned : ""].join(" ")}>
          {uploadAllowed && (
            <div className={classes.documentsInput}>
              <FileDropzone onFilesAdd={handleAddFiles} disabled={!uploadAllowed} uploadFormats={uploadFormats} />

              {inputPlugins}

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
              disabled={disabled}
            />
            {onStopRequest ? true : null}

            {onStopRequest && streaming ? (
              <Button onClick={onStopRequest} disabled={disabled}>
                <IconPlayerStopFilled size={16} /> Stop
              </Button>
            ) : (
              <Button
                onClick={handleSendMessage}
                disabled={sendMessageNotAllowed}
                className={onStopRequest && streaming ? classes.hidden : ""}
              >
                <IconSend size={16} /> Send
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
