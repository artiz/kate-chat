import React, { useMemo, useState } from "react";
import { NavLink, Menu, ActionIcon, Group, Button, TextInput, Loader, Box, Text } from "@mantine/core";
import {
  IconFolderOpen,
  IconFolderPlus,
  IconDots,
  IconEdit,
  IconTrash,
  IconPalette,
  IconFolder,
  IconFolderQuestion,
} from "@tabler/icons-react";
import { useLazyQuery, useMutation } from "@apollo/client";
import { useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import { useMantineTheme } from "@mantine/core";
import { DeleteConfirmationModal } from "@katechat/ui";
import { useAppDispatch, useAppSelector } from "@/store";
import { GET_FOLDER_CONTENTS, UPDATE_FOLDER_MUTATION, DELETE_FOLDER_MUTATION } from "@/store/services/graphql.queries";
import {
  setFolderLoading,
  setFolderContents,
  appendFolderChats,
  updateFolder,
  removeFolder,
} from "@/store/slices/folderSlice";
import { ChatFolder } from "@/types/graphql";
import { NewFolderModal } from "./NewFolderModal";
import { FolderColorPicker } from "./FolderColorPicker";
import { DraggableChatRow } from "./DraggableChatRow";
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
  const dispatch = useAppDispatch();

  const [isOpen, setIsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.name);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [newSubfolderOpen, setNewSubfolderOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const folderChatsData = useAppSelector(state => state.folders.folderChats[folder.id]);
  const folderColor = folder.color ? theme.colors[folder.color]?.[6] : undefined;
  const folderChats = folderChatsData?.chats || [];

  const indentPl = `calc(var(--mantine-spacing-sm) + ${depth} * var(--mantine-spacing-sm))`;
  const chatIndentPl = `calc(var(--mantine-spacing-sm) + ${depth + 1} * var(--mantine-spacing-sm))`;

  // Make the folder header a drop target for dragged chats
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: "folder", folderId: folder.id },
  });

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
            loading: false,
            initialLoaded: true,
          })
        );
      }
    },
    onError: error => {
      notifications.show({ title: t("common.error"), message: error.message, color: "red" });
      dispatch(setFolderLoading({ folderId: folder.id, loading: false }));
    },
  });

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

  const handleToggle = () => {
    const newOpen = !isOpen;
    setIsOpen(newOpen);
    if (newOpen && !folderChatsData?.initialLoaded) {
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
      {/* Folder header row — also the primary drop target */}
      <div ref={setDropRef} className={`${classes.chatItem} ${isOver ? classes.dropTarget : ""}`}>
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
                <DraggableChatRow key={chat.id} chat={chat} pl={chatIndentPl} navbarToggle={navbarToggle} />
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
    </>
  );
};
