import React, { useCallback, useState } from "react";
import { Group, Text, ActionIcon, Tooltip, Button, NavLink, Menu, TextInput, Box, Accordion } from "@mantine/core";
import {
  IconFolderPlus,
  IconMessage,
  IconDots,
  IconEdit,
  IconTrash,
  IconPin,
  IconPinFilled,
  IconFolderSymlink,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { DeleteConfirmationModal } from "@katechat/ui";
import { useAppSelector, useAppDispatch } from "@/store";
import { UPDATE_CHAT_MUTATION, DELETE_CHAT_MUTATION, GET_CHATS } from "@/store/services/graphql.queries";
import { addPinnedChats, updateChat, removeChat } from "@/store/slices/chatSlice";
import { Chat, GetChatsResponse } from "@/types/graphql";
import { FolderItem } from "./FolderItem";
import { NewFolderModal } from "./NewFolderModal";
import { MoveToChatModal } from "./MoveToChatModal";
import { CHAT_PAGE_SIZE } from "@/lib/config";

import classes from "./ChatsNavSection.module.scss";
import accordionClasses from "./MenuAccordion.module.scss";
import { useLocalStorage } from "@mantine/hooks";

interface IProps {
  navbarToggle?: () => void;
  expanded?: boolean;
}

export const PinnedChatsSection: React.FC<IProps> = ({ navbarToggle, expanded = true }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();

  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editedTitle, setEditedTitle] = useState("");
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [movingChat, setMovingChat] = useState<Chat | null>(null);
  const { pinnedChats, pinnedNext } = useAppSelector(state => state.chats);
  const { folders } = useAppSelector(state => state.folders);

  const [openMenu, setOpenMenu] = useLocalStorage<string[]>({
    key: "pinned-chats-menu",
    defaultValue: ["pinned"],
  });

  const currentChatId = location.pathname.startsWith("/chat/") ? location.pathname.split("/")[2] : undefined;

  const barePinnedChats = pinnedChats.filter(c => !c.isPristine && c.isPinned && !c.folderId);

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
      if (deletedId) dispatch(removeChat(deletedId));
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

  const { loading: loadingMore, refetch: fetchMorePinned } = useQuery<GetChatsResponse>(GET_CHATS, {
    fetchPolicy: "network-only",
    skip: true,
    onCompleted: data => {
      dispatch(addPinnedChats(data.getChats));
    },
    variables: {
      input: { pinned: true, limit: CHAT_PAGE_SIZE, from: pinnedNext },
    },
  });

  const handleChatRenameSubmit = (chatId: string) => {
    if (editedTitle.trim()) {
      updateChatMutation({ variables: { id: chatId, input: { title: editedTitle.trim() } } });
    } else {
      setEditingChatId(null);
    }
  };

  const handleNewFolder = useCallback((evt: React.MouseEvent<HTMLDivElement>) => {
    evt.stopPropagation();
    setShowNewFolderModal(true);
  }, []);

  if (!expanded) return null;
  if (folders.length === 0 && barePinnedChats.length === 0) return null;

  return (
    <Accordion
      multiple
      p="0"
      variant="default"
      chevronSize="lg"
      value={openMenu}
      onChange={setOpenMenu}
      classNames={accordionClasses}
    >
      <Accordion.Item key={"pinned"} value={"pinned"}>
        <Accordion.Control icon={<IconPinFilled />}>
          <Group justify="space-between" p="0" m="0">
            <Box>{t("chat.pinned")}</Box>
            <Tooltip label={t("chat.folder.new")} withArrow>
              <Box
                className="mantine-focus-auto mantine-active"
                size="sm"
                mr="md"
                my="0"
                variant="subtle"
                onClick={handleNewFolder}
              >
                <IconFolderPlus size={20} />
              </Box>
            </Tooltip>
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          {folders.map(folder => (
            <FolderItem key={folder.id} folder={folder} navbarToggle={navbarToggle} />
          ))}

          {barePinnedChats.map(chat => (
            <div key={chat.id} className={classes.chatItem}>
              {editingChatId === chat.id ? (
                <TextInput
                  value={editedTitle}
                  onChange={e => setEditedTitle(e.currentTarget.value)}
                  autoFocus
                  style={{ paddingLeft: "var(--mantine-spacing-sm)", flex: 1 }}
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
                    pl="sm"
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
                          setEditedTitle(chat.title || "");
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

          {pinnedNext != null && (
            <Group justify="center" pb="xs">
              <Button variant="subtle" size="xs" loading={loadingMore} onClick={() => fetchMorePinned()}>
                {t("chat.loadMore")}
              </Button>
            </Group>
          )}
        </Accordion.Panel>
      </Accordion.Item>

      <NewFolderModal isOpen={showNewFolderModal} onClose={() => setShowNewFolderModal(false)} />

      <DeleteConfirmationModal
        isOpen={!!deletingChatId}
        onClose={() => setDeletingChatId(null)}
        onConfirm={() => deletingChatId && deleteChatMutation({ variables: { id: deletingChatId } })}
        title={t("chat.deleteChatTitle")}
        message={t("chat.deleteChatMessage")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        isLoading={deleteChatLoading}
      />

      {movingChat && <MoveToChatModal isOpen onClose={() => setMovingChat(null)} chat={movingChat} />}
    </Accordion>
  );
};
