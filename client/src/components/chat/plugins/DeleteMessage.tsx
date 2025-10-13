import React, { useCallback, useState } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { DeleteMessageResponse, Message } from "@/types/graphql";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { PluginProps } from "@katechat/ui";
import { DELETE_MESSAGE_MUTATION } from "@/store/services/graphql";
import { DeleteMessageModal } from "./DeleteMessageModal";

/** Delete Message */
export const DeleteMessage = ({
  message,
  disabled = false,
  onAddMessage,
  onAction,
  onActionEnd,
  onMessageDeleted,
}: PluginProps<Message>) => {
  const { id, streaming, linkedToMessageId } = message;
  const [showModal, setShowModal] = useState<boolean>(false);

  const handleDeleteClick = useCallback(() => {
    setShowModal(true);
  }, []);

  // Delete message mutation
  const [deleteMessage, { loading: deletingMessage }] = useMutation<DeleteMessageResponse>(DELETE_MESSAGE_MUTATION, {
    onCompleted: res => {
      onActionEnd?.(id);
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
      onActionEnd?.(id);
      notifications.show({
        title: "Error",
        message: error.message || "Failed to delete message",
        color: "red",
      });
    },
  });

  // Handle delete single message
  const handleDeleteSingleMessage = useCallback(() => {
    deleteMessage({
      variables: {
        id,
        deleteFollowing: false,
      },
    });
    setShowModal(false);
  }, [id, deleteMessage]);

  // Handle delete message and following
  const handleDeleteMessageAndFollowing = useCallback(() => {
    deleteMessage({
      variables: {
        id,
        deleteFollowing: true,
      },
    });
    setShowModal(false);
  }, [id, deleteMessage]);

  return (
    <>
      <DeleteMessageModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onDeleteSingle={handleDeleteSingleMessage}
        onDeleteWithFollowing={linkedToMessageId ? undefined : handleDeleteMessageAndFollowing}
      />

      <Tooltip label="Delete message" position="top" withArrow>
        <ActionIcon
          className="delete-message-btn"
          data-message-id={id}
          size="sm"
          color="red.4"
          variant="transparent"
          disabled={disabled || streaming || deletingMessage}
          onClick={handleDeleteClick}
        >
          <IconTrash />
        </ActionIcon>
      </Tooltip>
    </>
  );
};
