import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, NavLink, Text, Group, Loader, Menu, ActionIcon, Accordion, Tooltip } from "@mantine/core";
import {
  IconMessage,
  IconDots,
  IconEdit,
  IconTrash,
  IconMessage2Code,
  IconPin,
  IconPinFilled,
  IconFolderSymlink,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { TextInput } from "@mantine/core";
import { DeleteConfirmationModal, sortItemsBySections } from "@katechat/ui";
import { useAppSelector, useAppDispatch } from "../../store";
import { UPDATE_CHAT_MUTATION, DELETE_CHAT_MUTATION, GET_CHATS } from "@/store/services/graphql.queries";
import { addChats, removeChat, updateChat } from "@/store/slices/chatSlice";
import { MoveToChatModal } from "./MoveToChatModal";

import classes from "./ChatsNavSection.module.scss";
import accordionClasses from "./MenuAccordion.module.scss";
import { Chat, GetChatsResponse } from "@/types/graphql";
import { CHAT_PAGE_SIZE } from "@/lib/config";
import { updateFolderChat } from "@/store/slices/folderSlice";
import { useLocalStorage } from "@mantine/hooks";

const CHATS_TO_SHOW_WHEN_COLLAPSED = 10;

interface IProps {
  navbarToggle?: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export const ChatsNavSection = ({ navbarToggle, expanded = true, onToggleExpand }: IProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [currentChatId, setCurrentChatId] = useState<string>();
  const [editingChatId, setEditingChatId] = useState<string | undefined>();
  const [deletingChatId, setDeletingChatId] = useState<string | undefined>();
  const [editedTitle, setEditedTitle] = useState<string>("");
  const [movingChat, setMovingChat] = useState<Chat | undefined>();
  const { chats, loading, error, next } = useAppSelector(state => state.chats);

  const sortedChats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const ago7Days = new Date(today);
    ago7Days.setDate(ago7Days.getDate() - 7);
    const ago30Days = new Date(today);
    ago30Days.setDate(ago30Days.getDate() - 30);

    return sortItemsBySections(
      chats.filter(chat => !chat.isPristine && !chat.isPinned),
      [
        {
          label: t("chat.today"),
          selector: (ch, dt) =>
            dt.getDate() === today.getDate() &&
            dt.getMonth() === today.getMonth() &&
            dt.getFullYear() === today.getFullYear(),
        },
        {
          label: t("chat.yesterday"),
          selector: (ch, dt) =>
            dt.getDate() === yesterday.getDate() &&
            dt.getMonth() === yesterday.getMonth() &&
            dt.getFullYear() === yesterday.getFullYear(),
        },
        { label: t("chat.last7Days"), selector: (ch, dt: Date) => dt > ago7Days && dt <= today },
        { label: t("chat.last30Days"), selector: (ch, dt: Date) => dt > ago30Days && dt <= today },
        { label: t("chat.older"), selector: false },
      ]
    );
  }, [chats, next, t]);

  const [openHistoryItems, setOpenHistoryItems] = useLocalStorage<string[]>({
    key: "chat-history-menu",
    defaultValue: sortedChats.map(block => block.label),
  });

  // Mutations
  const [updateChatMutation] = useMutation(UPDATE_CHAT_MUTATION, {
    onCompleted: () => {
      setEditingChatId(undefined);
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("chat.failedToRename"),
        color: "red",
      });
    },
    update: (cache, { data }, { variables }) => {
      if (data?.updateChat) {
        // Update existing chats from the cache
        const cacheId = cache.identify({ __typename: "Chat", id: variables?.id });
        if (cacheId) {
          // Remove the updated chat from the cache
          cache.evict({ id: cacheId });
          cache.gc();
          dispatch(updateChat(data.updateChat));
          dispatch(updateFolderChat(data.updateChat));
        }
      }
    },
  });

  const [deleteChat, { loading: deleteLoading }] = useMutation<any>(DELETE_CHAT_MUTATION, {
    onCompleted: (data, options) => {
      // Show success notification
      notifications.show({
        title: t("common.success"),
        message: t("chat.chatDeleted"),
        color: "green",
      });

      // Optimistically remove the chat from the local state
      const deletedChatId = options?.variables?.id;
      const remainingChats = chats.filter(chat => chat.id !== deletedChatId);

      // If the deleted chat was the current chat, navigate to another one
      if (deletedChatId === currentChatId) {
        if (remainingChats.length > 0) {
          // Navigate to the first available chat
          navigate(`/chat/${remainingChats[0].id}`);
        } else {
          // If no chats left, go to home page
          navigate("/");
        }
      }
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("chat.failedToDelete"),
        color: "red",
      });
    },
    // Ensure we update the cache immediately to remove the deleted chat
    update: (cache, { data }, { variables }) => {
      if (data?.deleteChat && variables?.id) {
        // Read the existing chats from the cache
        const cacheId = cache.identify({ __typename: "Chat", id: variables.id });
        if (cacheId) {
          dispatch(removeChat(variables.id));
          // Remove the deleted chat from the cache
          cache.removeOptimistic(cacheId);
          cache.gc();
        }
      }
    },
  });

  // Find pristine chat query
  const {
    loading: loadingChats,
    error: loadChatsError,
    refetch: fetchNextChats,
  } = useQuery<GetChatsResponse>(GET_CHATS, {
    fetchPolicy: "network-only",
    skip: true,
    onCompleted: data => {
      dispatch(addChats(data.getChats));
    },
    variables: {
      input: {
        limit: CHAT_PAGE_SIZE,
        from: next,
      },
    },
  });

  // Update current chat ID from URL
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith("/chat/")) {
      const id = path.split("/")[2];
      if (id && id !== "new") {
        setCurrentChatId(id);
      }
    } else {
      setCurrentChatId(undefined);
    }
  }, [location]);

  // Handle navigation to chat
  const handleChatClick = (id: string) => {
    navbarToggle?.();
    navigate(`/chat/${id}`);
  };

  const handleEditBlur = () => {
    setTimeout(() => setEditingChatId(undefined), 200); // Delay to allow click events to register
  };

  // Handle edit chat
  const handleEditClick = (e: React.MouseEvent, chat: Chat) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditedTitle(chat.title || t("chat.untitledChat"));
  };

  const updateChatTitle = (chatId: string) => {
    if (editedTitle.trim()) {
      updateChatMutation({
        variables: {
          id: chatId,
          input: {
            title: editedTitle.trim(),
          },
        },
      });
    }
  };

  // Handle save edited title
  const handleSaveTitle = (chatId: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    updateChatTitle(chatId);
  };

  const handleEditKeyUp = (chatId: string) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      updateChatTitle(chatId);
    } else if (e.key === "Escape") {
      setEditingChatId(undefined);
    }
  };

  // Handle delete chat
  const handleDeleteClick = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    setDeletingChatId(chatId);
  };

  const handleDeleteChat = () => {
    setDeletingChatId(undefined);
    deleteChat({
      variables: {
        id: deletingChatId,
      },
    });
  };

  // Handle pin/unpin chat
  const handleTogglePin = (e: React.MouseEvent, chat: Chat) => {
    e.stopPropagation();
    updateChatMutation({
      variables: {
        id: chat.id,
        input: {
          isPinned: !chat.isPinned,
        },
      },
    });
  };

  if (loading) {
    return (
      <Group justify="center" p="md">
        <Loader size="sm" />
      </Group>
    );
  }

  if (!expanded) {
    return (
      <>
        {chats.slice(0, CHATS_TO_SHOW_WHEN_COLLAPSED).map(chat => (
          <Tooltip key={chat.id} label={chat.title || t("chat.untitledChat")} position="right">
            <NavLink
              active={chat.id === currentChatId}
              leftSection={<IconMessage size={16} />}
              onClick={() => handleChatClick(chat.id)}
              pl="md"
            />
          </Tooltip>
        ))}
        {chats.length > CHATS_TO_SHOW_WHEN_COLLAPSED && onToggleExpand && (
          <Tooltip label={t("chat.showAllChats")} position="right">
            <NavLink leftSection={<IconDots size={16} />} onClick={onToggleExpand} />
          </Tooltip>
        )}
      </>
    );
  }

  if (error || loadChatsError) {
    return (
      <Text c="red" size="sm" ta="center">
        {t("chat.errorLoadingChats")} {String(error || loadChatsError)}
      </Text>
    );
  }
  if (chats?.length === 0) {
    return (
      <Text c="dimmed" size="sm" ta="center" m="lg">
        {t("chat.noChatsYet")}
      </Text>
    );
  }

  return (
    <Accordion
      multiple
      p="0"
      variant="default"
      chevronSize="lg"
      value={openHistoryItems}
      onChange={setOpenHistoryItems}
      classNames={accordionClasses}
    >
      {sortedChats.map(block => (
        <Accordion.Item key={block.label} value={block.label}>
          <Accordion.Control icon={block.icon || <IconMessage2Code />}>{block.label}</Accordion.Control>
          <Accordion.Panel>
            {block.items.map(chat => (
              <div key={chat.id} className={classes.chatItem}>
                {editingChatId === chat.id ? (
                  <TextInput
                    value={editedTitle}
                    onChange={e => setEditedTitle(e.currentTarget.value)}
                    autoFocus
                    rightSection={
                      <Button size="xs" p="xs" variant="subtle" onClick={handleSaveTitle(chat.id)}>
                        ✔️
                      </Button>
                    }
                    onKeyUp={handleEditKeyUp(chat.id)}
                    onBlur={handleEditBlur}
                  />
                ) : (
                  <>
                    <NavLink
                      active={chat.id === currentChatId}
                      label={chat.title || t("chat.untitledChat")}
                      leftSection={<IconMessage size={16} />}
                      onClick={() => handleChatClick(chat.id)}
                      p="xs"
                      pl="sm"
                      m="0"
                    />
                    <Menu
                      position="right"
                      withArrow
                      arrowPosition="center"
                      trigger="click"
                      openDelay={100}
                      closeDelay={400}
                    >
                      <Menu.Target>
                        <ActionIcon size="sm" onClick={e => e.stopPropagation()}>
                          <IconDots size={14} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={chat.isPinned ? <IconPinFilled size={14} /> : <IconPin size={14} />}
                          onClick={e => handleTogglePin(e, chat)}
                        >
                          {chat.isPinned ? t("chat.unpin") : t("chat.pin")}
                        </Menu.Item>
                        <Menu.Item leftSection={<IconEdit size={14} />} onClick={e => handleEditClick(e, chat)}>
                          {t("chat.rename")}
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconFolderSymlink size={14} />}
                          onClick={e => {
                            e.stopPropagation();
                            setMovingChat(chat);
                          }}
                        >
                          {t("chat.moveToFolder")}
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconTrash size={14} />}
                          color="red"
                          onClick={e => handleDeleteClick(e, chat.id)}
                        >
                          {t("common.delete")}
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </>
                )}
              </div>
            ))}
          </Accordion.Panel>
        </Accordion.Item>
      ))}

      {next ? (
        <Group justify="center" p="md">
          <Button variant="subtle" size="xs" onClick={() => fetchNextChats()} loading={loadingChats}>
            {t("chat.loadMore")}
          </Button>
        </Group>
      ) : null}

      <DeleteConfirmationModal
        isOpen={!!deletingChatId}
        onClose={() => setDeletingChatId(undefined)}
        onConfirm={handleDeleteChat}
        title={t("chat.deleteChatTitle")}
        message={t("chat.deleteChatMessage")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        isLoading={deleteLoading}
      />

      {movingChat && <MoveToChatModal isOpen onClose={() => setMovingChat(undefined)} chat={movingChat} />}
    </Accordion>
  );
};
