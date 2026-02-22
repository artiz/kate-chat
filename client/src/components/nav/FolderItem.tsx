import React, { useMemo, useState } from "react";
import { NavLink, Menu, ActionIcon, Group, Button, TextInput, Loader, Box, Text } from "@mantine/core";
import {
  IconFolderOpen,
  IconFolderPlus,
  IconDots,
  IconEdit,
  IconTrash,
  IconPalette,
  IconMessage,
  IconPin,
  IconPinFilled,
  IconFolderSymlink,
  IconFolder,
  IconFolderQuestion,
} from "@tabler/icons-react";
import { useLazyQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { notifications } from "@mantine/notifications";
import { useMantineTheme } from "@mantine/core";
import { DeleteConfirmationModal } from "@katechat/ui";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  GET_FOLDER_CONTENTS,
  UPDATE_FOLDER_MUTATION,
  DELETE_FOLDER_MUTATION,
  UPDATE_CHAT_MUTATION,
  DELETE_CHAT_MUTATION,
} from "@/store/services/graphql.queries";
import {
  setFolderLoading,
  setFolderContents,
  appendFolderChats,
  updateFolder,
  removeFolder,
  removeFolderChat,
} from "@/store/slices/folderSlice";
import { updateChat, removeChat } from "@/store/slices/chatSlice";
import { Chat, ChatFolder } from "@/types/graphql";
import { NewFolderModal } from "./NewFolderModal";
import { MoveToChatModal } from "./MoveToChatModal";
import { FolderColorPicker } from "./FolderColorPicker";
import { CHAT_PAGE_SIZE } from "@/lib/config";

import classes from "./ChatsNavSection.module.scss";

interface FolderItemProps {
  folder: ChatFolder;
  depth?: number;
  navbarToggle?: () => void;
}

export const FolderItem: React.FC<FolderItemProps> = ({ folder, depth = 0, navbarToggle }) => {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();

  const [isOpen, setIsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.name);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [newSubfolderOpen, setNewSubfolderOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editedChatTitle, setEditedChatTitle] = useState("");
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [movingChat, setMovingChat] = useState<Chat | null>(null);

  const currentChatId = location.pathname.startsWith("/chat/") ? location.pathname.split("/")[2] : undefined;

  const folderChatsData = useAppSelector(state => state.folders.folderChats[folder.id]);
  const folderColor = folder.color ? theme.colors[folder.color]?.[6] : undefined;
  const folderChats = folderChatsData?.chats || [];

  const indentPl = `calc(var(--mantine-spacing-sm) + ${depth} * var(--mantine-spacing-sm))`;
  const chatIndentPl = `calc(var(--mantine-spacing-sm) + ${depth + 1} * var(--mantine-spacing-sm))`;

  // Load folder contents on expand
  const [loadFolderContents, { loading: contentLoading }] = useLazyQuery(GET_FOLDER_CONTENTS, {
    fetchPolicy: "network-only",
    onCompleted: data => {
      const contents = data?.getFolderContents;
      if (contents) {
        dispatch(
          setFolderContents({
            folderId: folder.id,
            subfolders: contents.subfolders || [],
            chats: contents.chats || [],
            next: contents.next,
            total: contents.total,
          })
        );
      }
    },
    onError: error => {
      notifications.show({ title: t("common.error"), message: error.message, color: "red" });
      dispatch(setFolderLoading({ folderId: folder.id, loading: false }));
    },
  });

  // Load more chats in this folder
  const [loadMoreChats, { loading: loadMoreLoading }] = useLazyQuery(GET_FOLDER_CONTENTS, {
    fetchPolicy: "network-only",
    onCompleted: data => {
      const contents = data?.getFolderContents;
      if (contents) {
        dispatch(
          appendFolderChats({
            folderId: folder.id,
            chats: contents.chats || [],
            next: contents.next,
            total: contents.total,
          })
        );
      }
    },
  });

  const [updateFolderMutation] = useMutation(UPDATE_FOLDER_MUTATION, {
    onCompleted: data => {
      dispatch(updateFolder(data.updateFolder));
      setIsRenaming(false);
      setShowColorPicker(false);
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("chat.folder.failedToUpdate"),
        color: "red",
      });
    },
  });

  const [deleteFolderMutation, { loading: deleteLoading }] = useMutation(DELETE_FOLDER_MUTATION, {
    onCompleted: () => {
      dispatch(removeFolder(folder.id));
      setShowDeleteModal(false);
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("chat.folder.failedToDelete"),
        color: "red",
      });
    },
  });

  const [updateChatMutation] = useMutation(UPDATE_CHAT_MUTATION, {
    onCompleted: data => {
      dispatch(updateChat(data.updateChat));
      setEditingChatId(null);
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("chat.failedToRename"),
        color: "red",
      });
    },
  });

  const [deleteChatMutation, { loading: deleteChatLoading }] = useMutation(DELETE_CHAT_MUTATION, {
    onCompleted: (_, options) => {
      const deletedId = options?.variables?.id;
      if (deletedId) {
        dispatch(removeChat(deletedId));
        dispatch(removeFolderChat(deletedId));
      }
      setDeletingChatId(null);
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("chat.failedToDelete"),
        color: "red",
      });
    },
  });

  const handleToggle = () => {
    const newOpen = !isOpen;
    setIsOpen(newOpen);
    if (newOpen && !folderChatsData) {
      dispatch(setFolderLoading({ folderId: folder.id, loading: true }));
      loadFolderContents({
        variables: { input: { folderId: folder.id, limit: CHAT_PAGE_SIZE } },
      });
    }
  };

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue.trim() !== folder.name) {
      updateFolderMutation({ variables: { id: folder.id, input: { name: renameValue.trim() } } });
    } else {
      setIsRenaming(false);
    }
  };

  const handleChatRenameSubmit = (chatId: string) => {
    if (editedChatTitle.trim()) {
      updateChatMutation({ variables: { id: chatId, input: { title: editedChatTitle.trim() } } });
    } else {
      setEditingChatId(null);
    }
  };

  const handleDeleteChat = () => {
    if (deletingChatId) {
      deleteChatMutation({ variables: { id: deletingChatId } });
    }
  };

  // Direct children only (top-level folder expansion returns all descendants)
  const directSubfolders = useMemo(
    () => (folderChatsData?.subfolders || []).filter(f => f.parentId === folder.id),
    [folderChatsData, folder.id]
  );
  const isLoading = useMemo(() => folderChatsData?.loading || contentLoading, [folderChatsData, contentLoading]);
  const hasChildren = useMemo(
    () => directSubfolders.length > 0 || folderChats.length > 0,
    [directSubfolders, folderChats]
  );

  return (
    <>
      <div className={classes.chatItem}>
        {isRenaming ? (
          <TextInput
            value={renameValue}
            onChange={e => setRenameValue(e.currentTarget.value)}
            autoFocus
            style={{ paddingLeft: indentPl, flex: 1 }}
            onKeyDown={e => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") setIsRenaming(false);
            }}
            onBlur={() => setTimeout(() => setIsRenaming(false), 200)}
          />
        ) : (
          <>
            <NavLink
              label={
                <Text size="sm" c={folderColor}>
                  {folder.name}
                </Text>
              }
              leftSection={
                isOpen ? (
                  <IconFolderOpen size={16} color={folderColor} />
                ) : folderChatsData ? (
                  hasChildren ? (
                    <IconFolderPlus size={16} color={folderColor} />
                  ) : (
                    <IconFolder size={16} color={folderColor} />
                  )
                ) : (
                  <IconFolderQuestion size={16} color={folderColor} />
                )
              }
              onClick={handleToggle}
              pl={indentPl}
              style={{ flex: 1 }}
            />
            <Menu position="right" withArrow arrowPosition="center">
              <Menu.Target>
                <ActionIcon size="sm" onClick={e => e.stopPropagation()}>
                  <IconDots size={14} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconFolderPlus size={14} />} onClick={() => setNewSubfolderOpen(true)}>
                  {t("chat.folder.new")}
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconEdit size={14} />}
                  onClick={() => {
                    setRenameValue(folder.name);
                    setIsRenaming(true);
                  }}
                >
                  {t("chat.folder.rename")}
                </Menu.Item>
                <Menu.Item leftSection={<IconPalette size={14} />} onClick={() => setShowColorPicker(v => !v)}>
                  {t("chat.folder.changeColor")}
                </Menu.Item>
                <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={() => setShowDeleteModal(true)}>
                  {t("chat.folder.delete")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </>
        )}
      </div>

      {showColorPicker && (
        <Box px="sm" pb="xs">
          <FolderColorPicker
            value={folder.color}
            onChange={color => {
              updateFolderMutation({ variables: { id: folder.id, input: { color: color ?? null } } });
            }}
          />
        </Box>
      )}

      {isOpen && (
        <>
          {isLoading ? (
            <Group justify="center" py="xs">
              <Loader size="xs" />
            </Group>
          ) : (
            <>
              {directSubfolders.map(subfolder => (
                <FolderItem key={subfolder.id} folder={subfolder} depth={depth + 1} navbarToggle={navbarToggle} />
              ))}

              {folderChats.map(chat => (
                <div key={chat.id} className={classes.chatItem}>
                  {editingChatId === chat.id ? (
                    <TextInput
                      value={editedChatTitle}
                      onChange={e => setEditedChatTitle(e.currentTarget.value)}
                      autoFocus
                      style={{ paddingLeft: chatIndentPl, flex: 1 }}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleChatRenameSubmit(chat.id);
                        if (e.key === "Escape") setEditingChatId(null);
                      }}
                      onBlur={() => setTimeout(() => setEditingChatId(null), 200)}
                    />
                  ) : (
                    <>
                      <NavLink
                        active={chat.id === currentChatId}
                        label={chat.title || t("chat.untitledChat")}
                        leftSection={<IconMessage size={16} />}
                        onClick={() => {
                          navbarToggle?.();
                          navigate(`/chat/${chat.id}`);
                        }}
                        p="xs"
                        pl={chatIndentPl}
                        m="0"
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
                              setEditingChatId(chat.id);
                              setEditedChatTitle(chat.title || "");
                            }}
                          >
                            {t("chat.rename")}
                          </Menu.Item>
                          <Menu.Item leftSection={<IconFolderSymlink size={14} />} onClick={() => setMovingChat(chat)}>
                            {t("chat.moveToFolder")}
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconTrash size={14} />}
                            color="red"
                            onClick={() => setDeletingChatId(chat.id)}
                          >
                            {t("common.delete")}
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </>
                  )}
                </div>
              ))}

              {folderChatsData?.next != null && (
                <Group justify="center" py="xs">
                  <Button
                    variant="subtle"
                    size="xs"
                    loading={loadMoreLoading}
                    onClick={() =>
                      loadMoreChats({
                        variables: {
                          input: {
                            folderId: folder.id,
                            from: folderChatsData.next,
                            limit: CHAT_PAGE_SIZE,
                          },
                        },
                      })
                    }
                  >
                    {t("chat.folder.loadMore")}
                  </Button>
                </Group>
              )}
            </>
          )}
        </>
      )}

      <NewFolderModal isOpen={newSubfolderOpen} onClose={() => setNewSubfolderOpen(false)} parentFolderId={folder.id} />

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => deleteFolderMutation({ variables: { id: folder.id } })}
        title={t("chat.folder.deleteTitle")}
        message={t("chat.folder.deleteMessage")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        isLoading={deleteLoading}
      />

      <DeleteConfirmationModal
        isOpen={!!deletingChatId}
        onClose={() => setDeletingChatId(null)}
        onConfirm={handleDeleteChat}
        title={t("chat.deleteChatTitle")}
        message={t("chat.deleteChatMessage")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        isLoading={deleteChatLoading}
      />

      {movingChat && <MoveToChatModal isOpen onClose={() => setMovingChat(null)} chat={movingChat} />}
    </>
  );
};
