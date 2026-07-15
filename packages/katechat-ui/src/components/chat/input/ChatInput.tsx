import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Text, Textarea, Button, Group, ActionIcon, Stack, Box, Popover, Tooltip, Menu, Modal } from "@mantine/core";
import {
  IconCirclePlus,
  IconDatabase,
  IconFileText,
  IconMessagePlus,
  IconMicrophone,
  IconPhoneOff,
  IconPlayerStopFilled,
  IconSend,
  IconX,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { AudioInput, FileInput, ImageInput } from "@/core";
import { FileDropzone } from "@/controls";
import { useVoiceRecorder } from "@/hooks";
import { useTranslation } from "react-i18next";

import classes from "./ChatInput.module.scss";

export interface ChatInputRef {
  handleAddFiles: (files: File[]) => void;
}

interface IProps {
  chatId?: string;
  loadCompleted?: boolean;
  disabled?: boolean;
  promptMode?: boolean;
  promptText?: string;
  uploadAllowed?: boolean;
  streaming: boolean;
  setSending: (value: boolean) => void;
  previousMessages?: string[];
  header?: React.ReactNode;
  inputPlugins?: React.ReactNode;

  uploadFormats?: string[];
  maxUploadFileSize?: number;
  maxImagesCount?: number;
  /**
   * MIME types eligible to be attached inline as chat-context files (sent to
   * the model with the message). Empty/undefined disables the option: all
   * non-image files then go to RAG document upload.
   */
  contextFileFormats?: string[];
  maxContextFilesCount?: number;

  /** REALTIME (voice-to-voice) model: Send is replaced with a Mic call button */
  realtimeMode?: boolean;
  voiceCallActive?: boolean;
  voiceCallConnecting?: boolean;
  onVoiceCallStart?: () => void;
  onVoiceCallStop?: () => void;

  /** Model accepts audio input: a voice-recording button is shown next to Send */
  audioInputMode?: boolean;
  /** Reports recording state and a live microphone analyser for visualization */
  onRecordingChange?: (recording: boolean, analyser: AnalyserNode | null) => void;

  onSendMessage: (message: string, images?: ImageInput[], audio?: AudioInput, files?: FileInput[]) => Promise<void>;
  onStopRequest?: () => void;
  onDocumentsUpload?: (documents: File[]) => void;
}

export const ChatInput = forwardRef<ChatInputRef, IProps>(
  (
    {
      loadCompleted = false,
      disabled = false,
      promptMode = false,
      promptText,
      uploadAllowed = true,
      streaming,
      setSending,
      previousMessages = [],
      header,
      inputPlugins,
      uploadFormats,
      maxUploadFileSize = 64 * 1024 * 1024,
      maxImagesCount = 0,
      contextFileFormats = [],
      maxContextFilesCount = 5,
      realtimeMode = false,
      voiceCallActive = false,
      voiceCallConnecting = false,
      onVoiceCallStart,
      onVoiceCallStop,
      audioInputMode = false,
      onRecordingChange,
      onSendMessage,
      onStopRequest,
      onDocumentsUpload,
    },
    ref
  ) => {
    const [selectedImages, setSelectedImages] = useState<ImageInput[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<FileInput[]>([]);
    // non-image files awaiting the RAG-vs-chat-context choice
    const [pendingDocuments, setPendingDocuments] = useState<File[] | null>(null);
    const [recordedAudio, setRecordedAudio] = useState<AudioInput | null>(null);
    const [userMessage, setUserMessage] = useState("");
    const [prevMessageNdx, setPrevMessageNdx] = useState<number>(0);
    const [isMessageSeek, setMessageSeek] = useState<boolean>(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const { t } = useTranslation();

    const { recording, analyser, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();

    useEffect(() => {
      onRecordingChange?.(recording, analyser);
    }, [recording, analyser, onRecordingChange]);

    // drop leftover recording state when the chat or mode changes
    useEffect(() => {
      return () => cancelRecording();
    }, [audioInputMode, cancelRecording]);

    const handleToggleRecording = useCallback(async () => {
      if (recording) {
        const audio = await stopRecording();
        if (audio) {
          setRecordedAudio(audio);
        }
      } else {
        setRecordedAudio(null);
        try {
          await startRecording();
        } catch {
          notifications.show({
            title: t("Error"),
            message: t("Microphone access failed. Please allow microphone usage for this site."),
            color: "red",
          });
        }
      }
    }, [recording, startRecording, stopRecording, t]);

    useImperativeHandle(ref, () => ({
      handleAddFiles: (files: File[]) => handleAddFiles(files),
    }));

    useEffect(() => {
      inputRef.current?.focus();
    }, [loadCompleted, disabled]);

    useEffect(() => {
      setPrevMessageNdx(previousMessages?.length ? previousMessages.length : 0);
    }, [loadCompleted, previousMessages]);

    const handleSendMessage = async () => {
      if (!userMessage?.trim() && !selectedImages.length && !selectedFiles.length && !recordedAudio) return;
      setSending(true);

      try {
        setUserMessage("");
        setSelectedImages([]);
        setSelectedFiles([]);
        setRecordedAudio(null);
        await onSendMessage(
          userMessage,
          selectedImages,
          recordedAudio ?? undefined,
          selectedFiles.length ? selectedFiles : undefined
        );
      } catch (error) {
        notifications.show({
          title: "Error",
          message: error instanceof Error ? error.message : t("Failed to send message"),
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
          setMessageSeek(false);
        } else if (event.key === "ArrowUp" && (isEmpty || isMessageSeek)) {
          const ndx = Math.max(0, prevMessageNdx - 1);
          setUserMessage(previousMessages[ndx]);
          setPrevMessageNdx(ndx);
          setMessageSeek(true);
        } else if (event.key === "ArrowDown" && (isEmpty || isMessageSeek)) {
          const ndx = Math.min(previousMessages.length - 1, prevMessageNdx + 1);
          setUserMessage(previousMessages[ndx]);
          setPrevMessageNdx(ndx);
          setMessageSeek(true);
        } else {
          setMessageSeek(false);
        }
      },
      [handleSendMessage, userMessage, previousMessages, prevMessageNdx, isMessageSeek]
    );

    const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setUserMessage(event.currentTarget.value);
    }, []);

    /** Attach files inline as chat context: non-eligible ones fall back to RAG upload */
    const addContextFiles = useCallback(
      (documents: File[]) => {
        const eligible = documents.filter(f => contextFileFormats.includes(f.type));
        const rest = documents.filter(f => !contextFileFormats.includes(f.type));

        let filesToAdd = eligible;
        if (filesToAdd.length + selectedFiles.length > maxContextFilesCount) {
          notifications.show({
            title: t("Warning"),
            message: t("You can only add up to {{count}} files at a time", { count: maxContextFilesCount }),
            color: "yellow",
          });
          filesToAdd = filesToAdd.slice(0, Math.max(0, maxContextFilesCount - selectedFiles.length));
        }

        Promise.all(
          filesToAdd.map(
            file =>
              new Promise<FileInput>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => {
                  if (e.target?.result) {
                    resolve({
                      fileName: file.name,
                      mimeType: file.type,
                      bytesBase64: e.target.result as string,
                      size: file.size,
                    });
                  } else {
                    reject(new Error(t("Failed to read file: {{fileName}}", { fileName: file.name })));
                  }
                };
                reader.onerror = err =>
                  reject(
                    new Error(
                      t("Failed to read file: {{fileName}}, error: {{error}}", { fileName: file.name, error: err })
                    )
                  );
                reader.readAsDataURL(file);
              })
          )
        )
          .then(files => setSelectedFiles(prev => [...prev, ...files]))
          .catch(error => {
            notifications.show({
              title: t("Error"),
              message: error.message || t("Failed to read files"),
              color: "red",
            });
          });

        if (rest.length && onDocumentsUpload) {
          onDocumentsUpload(rest);
        }
      },
      [contextFileFormats, selectedFiles, maxContextFilesCount, onDocumentsUpload, t]
    );

    const sendMessageNotAllowed = useMemo(() => {
      return (
        disabled ||
        streaming ||
        recording ||
        (!userMessage?.trim() && !selectedImages.length && !selectedFiles.length && !recordedAudio)
      );
    }, [userMessage, selectedImages, selectedFiles, recordedAudio, recording, streaming, disabled]);

    const handleAddFiles = useCallback(
      (files: File[]) => {
        const filesToAdd = files.filter(f => f.size < maxUploadFileSize);
        if (filesToAdd.length < files.length) {
          notifications.show({
            title: t("Warning"),
            message: t(`Some files are too large and were not added (max size: {{size}} MB)`, {
              size: maxUploadFileSize / (1024 * 1024),
            }),
            color: "yellow",
          });
        }

        let imageFiles = filesToAdd.filter(f => f.type?.startsWith("image/"));
        const documents = filesToAdd.filter(f => !f.type?.startsWith("image/"));

        if (imageFiles.length && maxImagesCount <= 0) {
          notifications.show({
            title: t("Warning"),
            message: t("Image uploads are not allowed in this chat."),
            color: "yellow",
          });
          imageFiles = [];
        }

        // Limit images
        if (imageFiles.length + selectedImages.length > maxImagesCount) {
          notifications.show({
            title: t("Warning"),
            message: t("You can only add up to {{count}} images at a time", { count: maxImagesCount }),
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
                    const img = new Image();
                    img.src = bytesBase64;

                    img.onload = () =>
                      resolve({
                        fileName: file.name,
                        mimeType: file.type,
                        bytesBase64,
                        width: img.width,
                        height: img.height,
                      });
                    img.onerror = error => reject(error);
                  } else {
                    reject(new Error(t("Failed to read file: {{fileName}}", { fileName: file.name })));
                  }
                };
                reader.onerror = err => {
                  reject(
                    new Error(
                      t("Failed to read file: {{fileName}}, error: {{error}}", { fileName: file.name, error: err })
                    )
                  );
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
                title: t("Error"),
                message: error.message || t("Failed to read image files"),
                color: "red",
              });
            });
        }

        if (documents.length) {
          const contextEligible = documents.some(f => contextFileFormats.includes(f.type));

          if (contextEligible && onDocumentsUpload) {
            // both routes possible — let the user pick RAG vs chat context
            setPendingDocuments(documents);
          } else if (contextEligible) {
            addContextFiles(documents);
          } else if (onDocumentsUpload) {
            onDocumentsUpload(documents);
          } else {
            notifications.show({
              title: t("Warning"),
              message: t("Document upload is not available in this chat."),
              color: "orange",
            });
          }
        }
      },
      [selectedImages, onDocumentsUpload, maxImagesCount, maxUploadFileSize, contextFileFormats, addContextFiles]
    );

    const handleRemoveImage = (fileName: string): React.MouseEventHandler<HTMLButtonElement> => {
      return event => {
        event.stopPropagation();
        setSelectedImages(prev => prev.filter(f => f.fileName !== fileName));
      };
    };

    const handleRemoveFile = (fileName: string): React.MouseEventHandler<HTMLButtonElement> => {
      return event => {
        event.stopPropagation();
        setSelectedFiles(prev => prev.filter(f => f.fileName !== fileName));
      };
    };

    const resolvePendingDocuments = (target: "rag" | "context") => {
      const documents = pendingDocuments;
      setPendingDocuments(null);
      if (!documents?.length) return;

      if (target === "rag") {
        onDocumentsUpload?.(documents);
      } else {
        addContextFiles(documents);
      }
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
            <Text c="dimmed" size="lg" ta="center" className={classes.promptModeText}>
              {promptText || t("Start the conversation by sending a message")}
            </Text>
          </Stack>
        ) : null}

        <div className={classes.chatControls}>
          {header && (
            <Group align="center" gap="xs" className={classes.headerRow}>
              {header}
            </Group>
          )}

          <div
            className={[
              classes.chatInputContainer,
              selectedImages.length || selectedFiles.length ? classes.columned : "",
            ].join(" ")}
          >
            {uploadAllowed && (
              <div className={classes.documentsInput}>
                <Group visibleFrom="xs" gap="xs">
                  <FileDropzone onFilesAdd={handleAddFiles} uploadFormats={uploadFormats} />
                  {inputPlugins}
                </Group>

                {selectedImages?.length > 0 && (
                  <div className={classes.imagesList}>
                    {selectedImages.map((file, ndx) => (
                      <div key={file.fileName} className={classes.previewImage}>
                        <img src={file.bytesBase64} alt={file.fileName} />
                        <ActionIcon
                          className={classes.removeButton}
                          color="red.9"
                          size="xs"
                          onClick={handleRemoveImage(file.fileName)}
                        >
                          <IconX size={16} />
                        </ActionIcon>
                      </div>
                    ))}
                  </div>
                )}

                {selectedFiles?.length > 0 && (
                  <div className={classes.filesList} data-testid="context-files-list">
                    {selectedFiles.map(file => (
                      <Group key={file.fileName} gap={4} className={classes.previewFile}>
                        <IconFileText size={16} />
                        <Text size="xs" truncate maw={160} title={file.fileName}>
                          {file.fileName}
                        </Text>
                        <ActionIcon color="red.9" size="xs" variant="subtle" onClick={handleRemoveFile(file.fileName)}>
                          <IconX size={14} />
                        </ActionIcon>
                      </Group>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={classes.chatInputGroup}>
              {uploadAllowed && (
                <Menu shadow="md" width="content">
                  <Menu.Target>
                    <ActionIcon size="lg" variant="subtle" hiddenFrom="xs">
                      <Tooltip label={t("More...")} position="right" withArrow>
                        <IconCirclePlus size="24" />
                      </Tooltip>
                    </ActionIcon>
                  </Menu.Target>

                  <Menu.Dropdown>
                    <FileDropzone onFilesAdd={handleAddFiles} uploadFormats={uploadFormats} />
                    {inputPlugins}
                  </Menu.Dropdown>
                </Menu>
              )}
              <Textarea
                ref={inputRef}
                className={classes.chatInput}
                placeholder={
                  realtimeMode ? t("Voice conversation — use the microphone button") : t("Type your message...")
                }
                value={userMessage || ""}
                autosize
                minRows={1}
                maxRows={7}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                disabled={disabled || realtimeMode}
              />

              {realtimeMode ? (
                voiceCallActive || voiceCallConnecting ? (
                  <Button
                    onClick={() => onVoiceCallStop?.()}
                    color="red"
                    radius="md"
                    loading={voiceCallConnecting}
                    data-testid="voice-call-stop"
                  >
                    <IconPhoneOff size={24} />{" "}
                    <Text visibleFrom="md" ml="xs">
                      {t("End call")}
                    </Text>
                  </Button>
                ) : (
                  <Button
                    onClick={() => onVoiceCallStart?.()}
                    disabled={disabled}
                    radius="md"
                    data-testid="voice-call-start"
                  >
                    <IconMicrophone size={24} />{" "}
                    <Text visibleFrom="md" ml="xs">
                      {t("Talk")}
                    </Text>
                  </Button>
                )
              ) : (
                <>
                  {audioInputMode && (
                    <Tooltip label={recording ? t("Stop recording") : t("Record voice message")} position="top">
                      <ActionIcon
                        size="lg"
                        radius="md"
                        variant={recording ? "filled" : "subtle"}
                        color={recording ? "red" : undefined}
                        onClick={handleToggleRecording}
                        disabled={disabled || streaming}
                        className={classes.recordButton}
                        data-testid="voice-record-toggle"
                      >
                        {recording ? <IconPlayerStopFilled size={20} /> : <IconMicrophone size={20} />}
                      </ActionIcon>
                    </Tooltip>
                  )}

                  {onStopRequest && streaming ? (
                    <Button onClick={onStopRequest} disabled={disabled}>
                      <IconPlayerStopFilled size={24} /> <Text visibleFrom="md">{t("Stop")}</Text>
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSendMessage}
                      disabled={sendMessageNotAllowed}
                      className={onStopRequest && streaming ? classes.hidden : ""}
                      radius="md"
                    >
                      <IconSend size={24} />{" "}
                      <Text visibleFrom="md" ml="xs">
                        {t("Send")}
                      </Text>
                    </Button>
                  )}
                </>
              )}
            </div>

            {recordedAudio && !realtimeMode && (
              <Group gap="xs" className={classes.audioAttachment}>
                <audio controls src={recordedAudio.bytesBase64} />
                <Text size="xs" c="dimmed">
                  {recordedAudio.durationSec ? `${recordedAudio.durationSec}s` : recordedAudio.fileName}
                </Text>
                <ActionIcon size="xs" color="red.9" onClick={() => setRecordedAudio(null)}>
                  <IconX size={14} />
                </ActionIcon>
              </Group>
            )}
          </div>
        </div>

        <Modal
          opened={!!pendingDocuments}
          onClose={() => setPendingDocuments(null)}
          title={t("How should these files be used?")}
          centered
          data-testid="upload-type-selector"
        >
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {t(
                "RAG documents are indexed for semantic search across chats; chat context files are sent to the model together with your message."
              )}
            </Text>
            {pendingDocuments?.map(file => (
              <Group key={file.name} gap={4}>
                <IconFileText size={14} />
                <Text size="xs" truncate title={file.name}>
                  {file.name}
                </Text>
              </Group>
            ))}
            <Group grow mt="sm">
              <Button
                variant="light"
                leftSection={<IconDatabase size={18} />}
                onClick={() => resolvePendingDocuments("rag")}
                data-testid="upload-type-rag"
              >
                {t("RAG document")}
              </Button>
              <Button
                leftSection={<IconMessagePlus size={18} />}
                onClick={() => resolvePendingDocuments("context")}
                data-testid="upload-type-context"
              >
                {t("Chat context")}
              </Button>
            </Group>
          </Stack>
        </Modal>
      </div>
    );
  }
);
