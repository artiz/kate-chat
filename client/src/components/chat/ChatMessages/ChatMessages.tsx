import React, { useCallback, useRef, useState } from "react";
import { Stack, Group } from "@mantine/core";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { DELETE_MESSAGE_MUTATION, EDIT_MESSAGE_MUTATION } from "@/store/services/graphql";

import { ok } from "@/lib/assert";
import { ChatMessage } from "./ChatMessage";
import { DeleteMessageModal } from "./DeleteMessageModal";
import { ImageModal } from "@/components/modal/ImagePopup";
import { Message, Document, DeleteMessageResponse, EditMessageResponse } from "@/types/graphql";

import { CallOtherModel } from "./plugins/CallOtherModel";
import { SwitchModel } from "./plugins/SwitchModel";
import { EditMessage } from "./plugins/EditMessage";
import { InOutTokens } from "./plugins/InOutTokens";

interface ChatMessagesProps {
  messages: Message[];
  chatDocuments?: Document[];
  onMessageDeleted?: (args: { messagesToDelete?: Message[]; deleteAfter?: Message }) => void;
  onAddMessage?: (message: Message) => void;
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  chatDocuments,
  onMessageDeleted,
  onAddMessage,
}) => {
  const componentRef = useRef<HTMLDivElement>(null);

  // State for delete confirmation modal
  const [messageToDelete, setMessageToDelete] = useState<string | undefined>();
  const [isLinkedMessage, setIsLinkedMessage] = useState<boolean>(false);
  const [imageToShow, setImageToShow] = useState<string | undefined>();
  const [imageFileName, setImageFileName] = useState<string | undefined>();

  const [updatedMessages, setUpdatedMessages] = useState<Set<string>>(new Set());

  const addEditedMessage = (messageId: string) => {
    setUpdatedMessages(prev => new Set(prev).add(messageId));
  };

  const clearEditedMessage = (messageId: string) => {
    setUpdatedMessages(prev => {
      const set = new Set(prev);
      set.delete(messageId);
      return set;
    });
  };

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

      onMessageDeleted?.({
        messagesToDelete: res.deleteMessage.messages,
      });
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to delete message",
        color: "red",
      });
    },
  });

  // common messages interaction logic
  const handleMessageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!e.target) return;

      // common clicks logic to simplify code in ChatMessage component
      const classesToFind = [
        "code-copy-btn",
        "code-toggle-all",
        "copy-message-btn",
        "code-header",
        "message-image",

        "delete-message-btn",
      ];

      let el: HTMLElement = e.target as HTMLElement;
      for (const cls of classesToFind) {
        const trg = el.closest(`.${cls}`);
        if (trg) {
          el = trg as HTMLElement;
          break;
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
      // code toggle btn
      else if (target.classList.contains("message-image")) {
        const fileName = target.dataset["fileName"];
        const imageUrl = (target as HTMLImageElement).src;

        setImageToShow(imageUrl);
        setImageFileName(fileName);
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
              disabled={updatedMessages.has(msg.id) || deletingMessage}
              chatDocuments={chatDocuments}
              plugins={
                <>
                  <EditMessage
                    message={msg}
                    onAddMessage={onAddMessage}
                    onAction={addEditedMessage}
                    onActionEnd={clearEditedMessage}
                    onMessageDeleted={onMessageDeleted}
                    disabled={updatedMessages.has(msg.id)}
                  />
                  <CallOtherModel
                    message={msg}
                    onAddMessage={onAddMessage}
                    onAction={addEditedMessage}
                    onActionEnd={clearEditedMessage}
                    disabled={updatedMessages.has(msg.id)}
                  />
                  <SwitchModel
                    message={msg}
                    onAddMessage={onAddMessage}
                    onAction={addEditedMessage}
                    onActionEnd={clearEditedMessage}
                    disabled={updatedMessages.has(msg.id)}
                  />

                  <InOutTokens message={msg} />
                </>
              }
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

      {/* Image Preview Modal */}
      <ImageModal fileName={imageFileName ?? ""} fileUrl={imageToShow ?? ""} onClose={resetSelectedImage} />
    </>
  );
};
