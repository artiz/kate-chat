import React, { useCallback, useRef, useState } from "react";
import { Paper, Text, Stack, Group, Avatar, Loader, Box } from "@mantine/core";
import { IconRobot } from "@tabler/icons-react";
import { Message } from "@/store/slices/chatSlice";
import { gql, useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import {
  DELETE_MESSAGE_MUTATION,
  DeleteMessageResponse,
  SWITCH_MODEL_MUTATION,
  SwitchModelResponse,
} from "@/store/services/graphql";

import { ok } from "@/utils/assert";
import { ChatMessage } from "./ChatMessage";
import { DeleteMessageModal } from "./DeleteMessageModal";
import { ImageModal } from "@/components/modal/ImagePopup";

interface ChatMessagesProps {
  messages: Message[];
  sending: boolean;
  selectedModelName?: string;
  onMessageDeleted?: (ids: string[]) => void;
  onMessageModelSwitch?: (message: Message) => void;
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  sending,
  selectedModelName,
  onMessageDeleted,
  onMessageModelSwitch,
}) => {
  const componentRef = useRef<HTMLDivElement>(null);

  // State for delete confirmation modal
  const [messageToDelete, setMessageToDelete] = useState<string | undefined>();
  const [imageToShow, setImageToShow] = useState<string | undefined>();
  const [imageFileName, setImageFileName] = useState<string | undefined>();

  const resetSelectedImage = () => {
    setImageToShow(undefined);
    setImageFileName(undefined);
  };

  // Delete message mutation
  const [deleteMessage, { loading: deletingMessage }] = useMutation<DeleteMessageResponse>(DELETE_MESSAGE_MUTATION, {
    onCompleted: res => {
      notifications.show({
        title: "Message Deleted",
        message: "Message has been successfully deleted",
        color: "green",
      });

      onMessageDeleted?.(res.deleteMessage);
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to delete message",
        color: "red",
      });
    },
  });

  // Switch model mutation
  const [switchModel, { loading: switchingModel }] = useMutation<SwitchModelResponse>(SWITCH_MODEL_MUTATION, {
    onCompleted: res => {
      if (res.switchModel.error) {
        return notifications.show({
          title: "Error",
          message: res.switchModel.error,
          color: "red",
        });
      }
      onMessageModelSwitch?.(res.switchModel.message);
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to delete message",
        color: "red",
      });
    },
  });

  const handleSwitchModel = useCallback((messageId: string, modelId: string) => {
    switchModel({
      variables: {
        messageId,
        modelId,
      },
    });
  }, []);

  // common messages interaction logic
  const handleMessageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!e.target) return;
      const classesToFind = [
        "code-copy-btn",
        "code-header",
        "code-toggle-all",
        "copy-message-btn",
        "delete-message-btn",
        "message-image",
        "switch-model-btn",
      ];

      let el: HTMLElement = e.target as HTMLElement;
      let process = true;
      while (el && process) {
        for (const cls of classesToFind) {
          if (el.classList.contains(cls)) {
            process = false;
            break;
          }
        }
        if (process) {
          el = el.parentElement as HTMLElement;
        }
      }

      if (!el) {
        return;
      }

      const target = el as HTMLElement;
      const toggleCodeBlock = (header: HTMLElement) => {
        const codeBlock = header?.nextElementSibling as HTMLElement;
        if (codeBlock.classList.contains("collapsed")) {
          header.classList.remove("collapsed");
          codeBlock && codeBlock.classList.remove("collapsed");
        } else {
          header.classList.add("collapsed");
          codeBlock && codeBlock.classList.add("collapsed");
        }
      };

      // copy code block
      if (target.classList.contains("code-copy-btn")) {
        const data = target.parentElement?.parentElement?.nextElementSibling?.querySelector(
          ".code-data"
        ) as HTMLElement;
        if (data) {
          const code = decodeURIComponent(data.dataset.code || "").trim();
          navigator.clipboard.writeText(code);
        }

        const copyIcon = target.querySelector(".copy-icon") as HTMLElement;
        const checkIcon = target.querySelector(".check-icon") as HTMLElement;
        if (copyIcon && checkIcon) {
          copyIcon.style.display = "none";
          checkIcon.style.display = "block";
          setTimeout(() => {
            copyIcon.style.display = "block";
            checkIcon.style.display = "none";
          }, 2000);
        }
      }
      // code toggle btn
      else if (target.classList.contains("code-header")) {
        toggleCodeBlock(target);
      }
      // all code blocks toggle
      else if (target.classList.contains("code-toggle-all")) {
        componentRef.current?.querySelectorAll(".code-header").forEach(header => {
          toggleCodeBlock(header as HTMLElement);
        });
      }
      // copy message
      else if (target.classList.contains("copy-message-btn")) {
        if (target.dataset["messageId"]) {
          const index = target.dataset["messageIndex"];
          const msg = messages[Number(index)];
          ok(msg, "Message should exist to copy");
          const content = (msg.content || "").trim();
          navigator.clipboard.writeText(content);

          const checkIcon = target.parentElement?.querySelector(".check-icon") as HTMLElement;
          if (checkIcon) {
            target.style.display = "none";
            checkIcon.style.display = "inline-block";
            setTimeout(() => {
              target.style.display = "inline-block";
              checkIcon.style.display = "none";
            }, 2000);
          }
        }
      }
      // delete message
      else if (target.classList.contains("delete-message-btn")) {
        if (target.dataset["messageId"]) {
          const messageId = target.dataset["messageId"];
          setMessageToDelete(messageId);
        }
      }
      // code toggle btn
      else if (target.classList.contains("message-image")) {
        const fileName = target.dataset["fileName"];
        const imageUrl = (target as HTMLImageElement).src;

        setImageToShow(imageUrl);
        setImageFileName(fileName);
      } else if (target.classList.contains("switch-model-btn")) {
        const messageId = target.dataset["messageId"];
        const modelId = target.dataset["modelId"];
        ok(messageId, "Message ID should be defined for switch model");
        ok(modelId, "Model ID should be defined for switch model");
        handleSwitchModel(messageId, modelId);
      }
    },
    [messages]
  );

  // Handle delete single message
  const handleDeleteSingleMessage = useCallback(() => {
    if (!messageToDelete) return;

    deleteMessage({
      variables: {
        id: messageToDelete,
        deleteFollowing: false,
      },
    });
    setMessageToDelete(undefined);
  }, [messageToDelete, deleteMessage]);

  // Handle delete message and following
  const handleDeleteMessageAndFollowing = useCallback(() => {
    if (!messageToDelete) return;

    deleteMessage({
      variables: {
        id: messageToDelete,
        deleteFollowing: true,
      },
    });
    setMessageToDelete(undefined);
  }, [messageToDelete, deleteMessage]);

  return (
    <>
      <Stack gap="md" ref={componentRef} onClick={handleMessageClick}>
        {messages.map((msg, index) => (
          <Group key={msg.id} align="flex-start" gap="xs">
            <ChatMessage message={msg} index={index} disabled={deletingMessage || switchingModel} />
          </Group>
        ))}

        {sending && (
          <Group align="flex-start" gap="xs">
            <Avatar color="gray" radius="xl">
              <IconRobot />
            </Avatar>
            <Box>
              <Text size="sm" fw={500}>
                {selectedModelName || "AI"}
              </Text>
              <Paper p="sm" bg="gray.0" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Text size="sm" c="dimmed">
                  Generating response
                </Text>
                <Loader size="xs" />
              </Paper>
            </Box>
          </Group>
        )}
      </Stack>

      {/* Delete message confirmation modal */}
      <DeleteMessageModal
        isOpen={!!messageToDelete}
        onClose={() => setMessageToDelete(undefined)}
        onDeleteSingle={handleDeleteSingleMessage}
        onDeleteWithFollowing={handleDeleteMessageAndFollowing}
      />

      {/* Image Preview Modal */}
      <ImageModal fileName={imageFileName ?? ""} fileUrl={imageToShow ?? ""} onClose={resetSelectedImage} />
    </>
  );
};
