import React, { useCallback, useRef, useState } from "react";
import { Paper, Text, Stack, Group, Avatar, Loader, Box } from "@mantine/core";
import { IconRobot } from "@tabler/icons-react";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import {
  DELETE_MESSAGE_MUTATION,
  SWITCH_MODEL_MUTATION,
  CALL_OTHERS_MUTATION as CALL_OTHER_MUTATION,
  EDIT_MESSAGE_MUTATION,
} from "@/store/services/graphql";

import { ok } from "@/lib/assert";
import { ChatMessage } from "./ChatMessage";
import { DeleteMessageModal } from "./DeleteMessageModal";
import { EditMessageModal } from "./EditMessageModal";
import { ImageModal } from "@/components/modal/ImagePopup";
import {
  Message,
  Document,
  CallOthersResponse,
  DeleteMessageResponse,
  EditMessageResponse,
  SwitchModelResponse,
} from "@/types/graphql";

interface ChatMessagesProps {
  messages: Message[];
  sending: boolean;
  selectedModelName?: string;
  chatDocuments?: Document[];
  onMessageDeleted?: (res: DeleteMessageResponse) => void;
  onSending?: () => void;
  onMessageModelSwitch?: (message: Message) => void;
  onCallOther?: (message: Message) => void;
  onMessageEdit?: (message: Message) => void;
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  sending,
  selectedModelName,
  chatDocuments,
  onMessageDeleted,
  onSending,
  onMessageModelSwitch,
  onCallOther,
  onMessageEdit,
}) => {
  const componentRef = useRef<HTMLDivElement>(null);

  // State for delete confirmation modal
  const [messageToDelete, setMessageToDelete] = useState<string | undefined>();
  const [isLinkedMessage, setIsLinkedMessage] = useState<boolean>(false);
  const [imageToShow, setImageToShow] = useState<string | undefined>();
  const [imageFileName, setImageFileName] = useState<string | undefined>();

  // State for edit message modal
  const [messageToEdit, setMessageToEdit] = useState<string | undefined>();
  const [editedContent, setEditedContent] = useState<string>("");
  const [updatedMessageId, setUpdatedMessageId] = useState<string | undefined>();

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

      onMessageDeleted?.(res);
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
      setUpdatedMessageId(undefined);
    },
    onError: error => {
      setUpdatedMessageId(undefined);
      notifications.show({
        title: "Error",
        message: error.message || "Failed to switch model",
        color: "red",
      });
    },
  });

  // Call Others mutation
  const [callOther, { loading: callingOthers }] = useMutation<CallOthersResponse>(CALL_OTHER_MUTATION, {
    onCompleted: res => {
      if (res.callOther.error) {
        return notifications.show({
          title: "Error",
          message: res.callOther.error,
          color: "red",
        });
      }
      ok(res.callOther.message, "Call Other response should contain a message");
      onCallOther?.(res.callOther.message);
      setUpdatedMessageId(undefined);
    },
    onError: error => {
      setUpdatedMessageId(undefined);
      notifications.show({
        title: "Error",
        message: error.message || "Failed to call other models",
        color: "red",
      });
    },
  });

  // Edit message mutation
  const [editMessage, { loading: editingMessage }] = useMutation<EditMessageResponse>(EDIT_MESSAGE_MUTATION, {
    onCompleted: res => {
      if (res.editMessage.error) {
        return notifications.show({
          title: "Error",
          message: res.editMessage.error,
          color: "red",
        });
      }
      setMessageToEdit(undefined);
      setEditedContent("");

      notifications.show({
        title: "Message Edited",
        message: "Message has been edited and following messages regenerated",
        color: "green",
      });

      ok(res.editMessage.message, "Edit Message response should contain a message");
      onMessageEdit?.(res.editMessage.message);
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to edit message",
        color: "red",
      });
    },
  });

  const handleSwitchModel = useCallback(
    (messageId: string, modelId: string) => {
      setUpdatedMessageId(messageId);
      switchModel({
        variables: {
          messageId,
          modelId,
        },
      });
    },
    [switchModel, onSending]
  );

  const handleCallOther = useCallback(
    (messageId: string, modelId: string) => {
      setUpdatedMessageId(messageId);
      callOther({
        variables: {
          input: {
            messageId,
            modelId,
          },
        },
      });
    },
    [callOther, onSending]
  );

  const handleEditMessage = useCallback(
    (messageId: string) => {
      const message = messages.find(m => m.id === messageId);
      if (message) {
        setMessageToEdit(messageId);
        setEditedContent(message.content || "");
      }
    },
    [messages]
  );

  const handleSaveEditedMessage = useCallback(() => {
    if (!messageToEdit || !editedContent.trim()) return;

    editMessage({
      variables: {
        messageId: messageToEdit,
        content: editedContent.trim(),
      },
    });
  }, [messageToEdit, editedContent, editMessage]);

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
        "edit-message-btn",
        "message-image",
        "switch-model-btn",
        "call-other-btn",
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
          const linkedIndex = target.dataset["messageLinkedIndex"];

          let msg: Message | undefined = messages[Number(index)];
          if (linkedIndex != undefined) {
            msg = msg.linkedMessages?.[Number(linkedIndex)];
          }
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
          const isLinked = target.dataset["messageIsLinked"];

          setMessageToDelete(messageId);
          setIsLinkedMessage(!!isLinked);
        }
      }
      // edit message
      else if (target.classList.contains("edit-message-btn")) {
        if (target.dataset["messageId"]) {
          const messageId = target.dataset["messageId"];
          handleEditMessage(messageId);
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
      } else if (target.classList.contains("call-other-btn")) {
        const messageId = target.dataset["messageId"];
        const modelId = target.dataset["modelId"];
        ok(messageId, "Message ID should be defined for call others");
        ok(modelId, "Model IDs should be defined for call others");
        handleCallOther(messageId, modelId);
      }
    },
    [messages, handleEditMessage, handleSwitchModel, handleCallOther]
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
    setIsLinkedMessage(false);
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
    setIsLinkedMessage(false);
  }, [messageToDelete, deleteMessage]);

  return (
    <>
      <Stack gap="xs" ref={componentRef} onClick={handleMessageClick}>
        {messages.map((msg, index) => (
          <Group key={msg.id} align="flex-start" gap="xs">
            <ChatMessage
              message={msg}
              index={index}
              disabled={deletingMessage || switchingModel || callingOthers || editingMessage}
              loading={msg.id === updatedMessageId}
              chatDocuments={chatDocuments}
            />
          </Group>
        ))}
      </Stack>

      {/* Delete message confirmation modal */}
      <DeleteMessageModal
        isOpen={!!messageToDelete}
        onClose={() => setMessageToDelete(undefined)}
        onDeleteSingle={handleDeleteSingleMessage}
        onDeleteWithFollowing={isLinkedMessage ? undefined : handleDeleteMessageAndFollowing}
      />

      {/* Edit message modal */}
      <EditMessageModal
        isOpen={!!messageToEdit}
        content={editedContent}
        onContentChange={setEditedContent}
        onClose={() => {
          setMessageToEdit(undefined);
          setEditedContent("");
        }}
        onSave={handleSaveEditedMessage}
        loading={editingMessage}
      />

      {/* Image Preview Modal */}
      <ImageModal fileName={imageFileName ?? ""} fileUrl={imageToShow ?? ""} onClose={resetSelectedImage} />
    </>
  );
};
