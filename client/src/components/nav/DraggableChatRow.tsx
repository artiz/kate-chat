import React, { useState } from "react";
import { NavLink, Menu, ActionIcon, TextInput, StyleProp, MantineSpacing } from "@mantine/core";
import {
  IconDots,
  IconEdit,
  IconTrash,
  IconPin,
  IconPinFilled,
  IconFolderSymlink,
  IconGripVertical,
  IconMessage,
} from "@tabler/icons-react";
import { useDraggable } from "@dnd-kit/core";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { DeleteConfirmationModal } from "@katechat/ui";
import { useAppDispatch } from "@/store";
import { UPDATE_CHAT_MUTATION, DELETE_CHAT_MUTATION } from "@/store/services/graphql.queries";
import { updateChat, removeChat } from "@/store/slices/chatSlice";
import { removeFolderChat } from "@/store/slices/folderSlice";
import { Chat } from "@/types/graphql";
import { MoveToChatModal } from "./MoveToChatModal";

import classes from "./ChatsNavSection.module.scss";

interface Props {
  chat: Chat;
  navbarToggle?: () => void;
  pl?: StyleProp<MantineSpacing>;
}

export const DraggableChatRow: React.FC<Props> = ({ chat, navbarToggle, pl = "sm" }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(chat.title || "");
  const [deletingOpen, setDeletingOpen] = useState(false);
  const [movingOpen, setMovingOpen] = useState(false);

  const currentChatId = location.pathname.startsWith("/chat/") ? location.pathname.split("/")[2] : undefined;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `chat-${chat.id}`,
    data: { type: "chat", chat },
  });

  const [updateChatMutation] = useMutation(UPDATE_CHAT_MUTATION, {
    onCompleted: data => {
      dispatch(updateChat(data.updateChat));
      setIsRenaming(false);
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("chat.failedToRename"),
        color: "red",
      });
    },
  });

  const [deleteChatMutation, { loading: deleteLoading }] = useMutation(DELETE_CHAT_MUTATION, {
    onCompleted: (_, options) => {
      const id = options?.variables?.id as string | undefined;
      if (id) {
        dispatch(removeChat(id));
        dispatch(removeFolderChat(id));
        if (id === currentChatId) navigate("/");
      }
      setDeletingOpen(false);
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("chat.failedToDelete"),
        color: "red",
      });
    },
  });

  const handleRenameSubmit = () => {
    if (renameValue.trim()) {
      updateChatMutation({ variables: { id: chat.id, input: { title: renameValue.trim() } } });
    } else {
      setIsRenaming(false);
    }
  };

  return (
    <>
      <div ref={setNodeRef} {...attributes} className={classes.chatItem} style={{ opacity: isDragging ? 0.4 : 1 }}>
        {isRenaming ? (
          <TextInput
            value={renameValue}
            onChange={e => setRenameValue(e.currentTarget.value)}
            autoFocus
            onKeyDown={e => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") setIsRenaming(false);
            }}
            onBlur={() => setTimeout(() => setIsRenaming(false), 200)}
          />
        ) : (
          <>
            <NavLink
              active={chat.id === currentChatId}
              label={chat.title || t("chat.untitledChat")}
              leftSection={
                <span {...listeners} className={classes.dragHandle} title={t("chat.drag")}>
                  <IconMessage size={16} />
                  <IconGripVertical size={12} />
                </span>
              }
              onClick={() => {
                navbarToggle?.();
                navigate(`/chat/${chat.id}`);
              }}
              pl={pl}
            />
            <Menu position="right" withArrow arrowPosition="center">
              <Menu.Target>
                <ActionIcon size="sm" onClick={e => e.stopPropagation()}>
                  <IconDots size={14} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={chat.isPinned ? <IconPinFilled size={14} /> : <IconPin size={14} />}
                  onClick={() =>
                    updateChatMutation({
                      variables: { id: chat.id, input: { isPinned: !chat.isPinned } },
                    })
                  }
                >
                  {chat.isPinned ? t("chat.unpin") : t("chat.pin")}
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconEdit size={14} />}
                  onClick={() => {
                    setRenameValue(chat.title || "");
                    setIsRenaming(true);
                  }}
                >
                  {t("chat.rename")}
                </Menu.Item>
                <Menu.Item leftSection={<IconFolderSymlink size={14} />} onClick={() => setMovingOpen(true)}>
                  {t("chat.moveToFolder")}
                </Menu.Item>
                <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={() => setDeletingOpen(true)}>
                  {t("common.delete")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </>
        )}
      </div>

      <DeleteConfirmationModal
        isOpen={deletingOpen}
        onClose={() => setDeletingOpen(false)}
        onConfirm={() => deleteChatMutation({ variables: { id: chat.id } })}
        title={t("chat.deleteChatTitle")}
        message={t("chat.deleteChatMessage")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        isLoading={deleteLoading}
      />

      {movingOpen && <MoveToChatModal isOpen onClose={() => setMovingOpen(false)} chat={chat} />}
    </>
  );
};
