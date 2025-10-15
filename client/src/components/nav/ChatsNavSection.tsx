import React, { use, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Stack, Button, NavLink, Text, Group, Loader, Menu, ActionIcon } from "@mantine/core";
import { IconMessage, IconDots, IconEdit, IconTrash } from "@tabler/icons-react";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { TextInput } from "@mantine/core";
import { useAppSelector, useAppDispatch } from "../../store";
import { Chat, UPDATE_CHAT_MUTATION, DELETE_CHAT_MUTATION } from "@/store/services/graphql";
import { removeChat, updateChat } from "@/store/slices/chatSlice";
import { notEmpty } from "@/lib/assert";

import classes from "./ChatsNavSection.module.scss";
import { DeleteConfirmationModal } from "../modal";

export interface ChatsSectionBlock {
  label: string;
  chats: Chat[];
}

const isToday = (date: string) => {
  const today = new Date();
  const dateToCheck = new Date(date);
  return (
    dateToCheck.getDate() === today.getDate() &&
    dateToCheck.getMonth() === today.getMonth() &&
    dateToCheck.getFullYear() === today.getFullYear()
  );
};

const isWithinLastDays = (date: string, days: number): boolean => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysAgo = new Date(today);
  daysAgo.setDate(today.getDate() - days);

  const dateToCheck = new Date(date);
  return dateToCheck > daysAgo && dateToCheck <= today;
};

const isYesterday = (date: string) => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateToCheck = new Date(date);
  return (
    dateToCheck.getDate() === yesterday.getDate() &&
    dateToCheck.getMonth() === yesterday.getMonth() &&
    dateToCheck.getFullYear() === yesterday.getFullYear()
  );
};

export const sortChats = (chats: Chat[]): ChatsSectionBlock[] => {
  // sort conversations by last activity
  const sortedChats = [...chats];
  sortedChats.sort((a, b) => {
    if (a.updatedAt === undefined) {
      return 1;
    }
    if (b.updatedAt === undefined) {
      return -1;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const todayChats: Chat[] = [];
  const yesterdayChats: Chat[] = [];
  const last7DaysChats: Chat[] = [];
  const last30DaysChats: Chat[] = [];
  const olderChats: Chat[] = [];
  const pinnedChats: Chat[] = [];

  sortedChats.forEach(chat => {
    const date = chat.updatedAt || "";
    if (chat.isPristine) {
      return;
    }
    if (chat.isPinned) {
      pinnedChats.push(chat);
    } else if (isToday(date)) {
      todayChats.push(chat);
    } else if (isYesterday(date)) {
      yesterdayChats.push(chat);
    } else if (isWithinLastDays(date, 7)) {
      last7DaysChats.push(chat);
    } else if (isWithinLastDays(date, 30)) {
      last30DaysChats.push(chat);
    } else {
      olderChats.push(chat);
    }
  });

  return [
    todayChats.length > 0
      ? {
          label: "Today",
          chats: todayChats,
        }
      : null,
    yesterdayChats.length > 0
      ? {
          label: "Yesterday",
          chats: yesterdayChats,
        }
      : null,
    last7DaysChats.length > 0
      ? {
          label: "Last 7 Days",
          chats: last7DaysChats,
        }
      : null,
    last30DaysChats.length > 0
      ? {
          label: "Last 30 Days",
          chats: last30DaysChats,
        }
      : null,
    olderChats.length > 0
      ? {
          label: "Older",
          chats: olderChats,
        }
      : null,
    pinnedChats.length > 0
      ? {
          label: "Pinned",
          chats: pinnedChats,
        }
      : null,
  ].filter(notEmpty);
};

interface IProps {
  navbarToggle?: () => void;
}

export const ChatsNavSection = ({ navbarToggle }: IProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [currentChatId, setCurrentChatId] = useState<string>();
  const [editingChatId, setEditingChatId] = useState<string | undefined>();
  const [deletingChatId, setDeletingChatId] = useState<string | undefined>();
  const [editedTitle, setEditedTitle] = useState<string>("");

  const { chats, loading, error } = useAppSelector(state => state.chats);
  const sortedChats = useMemo(() => sortChats(chats), [chats]);
  const deletingChat = useMemo(
    () => (deletingChatId ? chats.find(chat => chat.id === deletingChatId) : undefined),
    [deletingChatId, chats]
  );

  // Mutations
  const [updateChatMutation] = useMutation(UPDATE_CHAT_MUTATION, {
    onCompleted: () => {
      setEditingChatId(undefined);
      notifications.show({
        title: "Success",
        message: "Chat renamed successfully",
        color: "green",
      });
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to rename chat",
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
        }
      }
    },
  });

  const [deleteChat, { loading: deleteLoading }] = useMutation<any>(DELETE_CHAT_MUTATION, {
    onCompleted: (data, options) => {
      // Show success notification
      notifications.show({
        title: "Success",
        message: "Chat deleted successfully",
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
        title: "Error",
        message: error.message || "Failed to delete chat",
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
    setEditedTitle(chat.title || "Untitled Chat");
  };

  const updateTitle = (chatId: string) => {
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
    updateTitle(chatId);
  };

  const handleEditKeyUp = (chatId: string) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      updateTitle(chatId);
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
    deleteChat({
      variables: {
        id: deletingChatId,
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

  if (error) {
    return (
      <Text c="red" size="sm" ta="center">
        Error loading chats: {error}
      </Text>
    );
  }
  if (chats?.length === 0) {
    return (
      <Text c="dimmed" size="sm" ta="center">
        No chats yet
      </Text>
    );
  }

  return (
    <Stack gap="0">
      {sortedChats.map((block, index) => (
        <Stack key={index} className={classes.chatsBlock} gap="0">
          <div className={classes.chatsBlockLabel}>{block.label}</div>
          {block.chats.map(chat => (
            <div key={chat.id} style={{ position: "relative" }}>
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
                <Group justify="space-between" wrap="nowrap" className={classes.chatItem} gap="0">
                  <NavLink
                    active={chat.id === currentChatId}
                    label={chat.title || "Untitled Chat"}
                    leftSection={<IconMessage size={16} />}
                    onClick={() => handleChatClick(chat.id)}
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
                      <Menu.Item leftSection={<IconEdit size={14} />} onClick={e => handleEditClick(e, chat)}>
                        Rename
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconTrash size={14} />}
                        color="red"
                        onClick={e => handleDeleteClick(e, chat.id)}
                      >
                        Delete
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              )}
            </div>
          ))}
        </Stack>
      ))}

      <DeleteConfirmationModal
        isOpen={!!deletingChatId}
        onClose={() => setDeletingChatId(undefined)}
        onConfirm={handleDeleteChat}
        title="Delete Chat"
        message={`Are you sure you want to delete "${deletingChat?.title}"? This action cannot be undone and will remove the chat and all its associated data.`}
        confirmLabel="Delete"
        isLoading={deleteLoading}
      />
    </Stack>
  );
};
