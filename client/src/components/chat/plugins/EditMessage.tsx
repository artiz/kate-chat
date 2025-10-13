import React, { useCallback, useState } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconEdit } from "@tabler/icons-react";
import { EditMessageResponse, Message } from "@/types/graphql";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { MessageRole, PluginProps } from "@katechat/ui";
import { EDIT_MESSAGE_MUTATION } from "@/store/services/graphql";
import { ok } from "@/lib/assert";
import { EditMessageModal } from "./EditMessageModal";

/** Edit Message button - only show on User messages */
export const EditMessage = ({
  message,
  disabled = false,
  onAddMessage,
  onAction,
  onActionEnd,
  onMessageDeleted,
}: PluginProps<Message>) => {
  const { role, id, content = "" } = message;
  const [isEdited, setIsEdited] = useState<boolean>(false);
  const [editedContent, setEditedContent] = useState<string>("");

  // Edit message mutation
  const [editMessage, { loading: editingMessage }] = useMutation<EditMessageResponse>(EDIT_MESSAGE_MUTATION, {
    onCompleted: res => {
      onActionEnd?.(id);

      if (res.editMessage.error) {
        return notifications.show({
          title: "Error",
          message: res.editMessage.error,
          color: "red",
        });
      }

      setIsEdited(false);
      setEditedContent("");

      notifications.show({
        title: "Message Edited",
        message: "Message has been edited and following messages regenerated",
        color: "green",
      });

      ok(res.editMessage.message, "Edit Message response should contain a message");
      const resMessage = res.editMessage.message;

      onMessageDeleted?.({ deleteAfter: resMessage });
      onAddMessage?.(resMessage);
    },
    onError: error => {
      setIsEdited(false);
      onActionEnd?.(id);

      notifications.show({
        title: "Error",
        message: error.message || "Failed to edit message",
        color: "red",
      });
    },
  });

  const handleSaveEditedMessage = useCallback(() => {
    if (!editedContent.trim()) return;
    onAction?.(id);
    editMessage({
      variables: {
        messageId: id,
        content: editedContent.trim(),
      },
    });
  }, [id, editedContent, editMessage]);

  const handleEditMessage = useCallback(() => {
    setIsEdited(true);
    setEditedContent(content);
  }, []);

  return role === MessageRole.USER ? (
    <>
      <Tooltip label="Edit message" position="top" withArrow>
        <ActionIcon
          className="edit-message-btn"
          data-message-id={id}
          size="sm"
          color="blue.4"
          variant="transparent"
          disabled={disabled}
          onClick={handleEditMessage}
        >
          <IconEdit />
        </ActionIcon>
      </Tooltip>
      <EditMessageModal
        isOpen={isEdited}
        content={editedContent}
        onContentChange={setEditedContent}
        onClose={() => {
          setIsEdited(false);
          setEditedContent("");
        }}
        onSave={handleSaveEditedMessage}
        loading={editingMessage}
      />
    </>
  ) : null;
};
