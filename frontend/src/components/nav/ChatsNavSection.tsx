import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Stack, Button, NavLink, Text, Group, Loader, Divider, ScrollArea, Menu, ActionIcon } from "@mantine/core";
import { IconPlus, IconSettings, IconMessage, IconRobot, IconDots, IconEdit, IconTrash } from "@tabler/icons-react";
import { useMutation } from "@apollo/client";
import { UPDATE_CHAT_MUTATION, DELETE_CHAT_MUTATION } from "../../store/services/graphql";
import { notifications } from "@mantine/notifications";
import { TextInput } from "@mantine/core";
import { useAppSelector, useAppDispatch } from "../../store";
import { Chat, removeChat, updateChat } from "@/store/slices/chatSlice";
import { notEmpty } from "@/utils/assert";

import classes from "./ChatsNavSection.module.scss";

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

export const ChatsNavSection = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [currentChatId, setCurrentChatId] = useState<string>();
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editedTitle, setEditedTitle] = useState<string>("");

  const { chats, loading, error } = useAppSelector(state => state.chats);

  const sortedChats = useMemo(() => sortChats(chats), [chats]);

  // Mutations
  const [updateChatMutation] = useMutation(UPDATE_CHAT_MUTATION, {
    onCompleted: () => {
      setIsEditing(null);
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

  const [deleteChat] = useMutation<any>(DELETE_CHAT_MUTATION, {
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
      const id = path.split("/").pop();
      if (id && id !== "new") {
        setCurrentChatId(id);
      }
    } else {
      setCurrentChatId(undefined);
    }
  }, [location]);

  // Handle navigation to chat
  const handleChatClick = (id: string) => {
    navigate(`/chat/${id}`);
  };

  // Handle edit chat
  const handleEditClick = (e: React.MouseEvent, chat: Chat) => {
    e.stopPropagation();
    setIsEditing(chat.id);
    setEditedTitle(chat.title || "Untitled Chat");
  };

  // Handle save edited title
  const handleSaveTitle = (e: React.FormEvent, chatId: string) => {
    e.preventDefault();
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

  // Handle delete chat
  const handleDeleteClick = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this chat?")) {
      // Delete the chat, navigation will be handled in the mutation's onCompleted callback
      deleteChat({
        variables: {
          id: chatId,
        },
      });
    }
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
              {isEditing === chat.id ? (
                <form onSubmit={e => handleSaveTitle(e, chat.id)}>
                  <TextInput
                    value={editedTitle}
                    onChange={e => setEditedTitle(e.currentTarget.value)}
                    autoFocus
                    rightSection={
                      <Button type="submit" size="xs" p="xs" variant="subtle">
                        ✔️
                      </Button>
                    }
                    onBlur={() => setIsEditing(null)}
                  />
                </form>
              ) : (
                <Group justify="space-between" wrap="nowrap" className={classes.chatItem} gap="0">
                  <NavLink
                    style={{ flex: 1 }}
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
    </Stack>
  );
};
