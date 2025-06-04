import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Stack, Button, NavLink, Text, Group, Loader, Divider, ScrollArea, Menu, ActionIcon } from "@mantine/core";
import { IconPlus, IconSettings, IconMessage, IconRobot, IconDots, IconEdit, IconTrash } from "@tabler/icons-react";
import { useMutation, gql } from "@apollo/client";
import { UPDATE_CHAT_MUTATION, DELETE_CHAT_MUTATION } from "../../store/services/graphql";
import { notifications } from "@mantine/notifications";
import { TextInput } from "@mantine/core";
import { useAppSelector, useAppDispatch } from "../../store";
import { Chat, removeChat, updateChat } from "@/store/slices/chatSlice";

import classes from "./NavbarContent.module.scss";

const NavbarContent: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [currentChatId, setCurrentChatId] = useState<string>();
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editedTitle, setEditedTitle] = useState<string>("");

  // Get chats from Redux store
  const { chats, loading, error } = useAppSelector(state => state.chats);

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

  // We already have dispatch from above

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

  // Handle navigation to create new chat
  const handleNewChat = () => {
    navigate("/chat/new");
  };

  // Handle navigation to chat
  const handleChatClick = (id: string) => {
    navigate(`/chat/${id}`);
  };

  // Handle navigation to models page
  const handleModelsClick = () => {
    navigate("/models");
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

  return (
    <Stack h="100%" justify="space-between" gap="0">
      <Stack gap="xs">
        <Button leftSection={<IconPlus size={16} />} variant="light" onClick={handleNewChat} fullWidth>
          New Chat
        </Button>

        <Divider my="xs" />

        <Stack gap="xs">
          <NavLink
            label="Models"
            leftSection={<IconRobot size={16} />}
            active={location.pathname === "/models"}
            onClick={handleModelsClick}
          />
          <NavLink
            label="Settings"
            leftSection={<IconSettings size={16} />}
            active={location.pathname === "/settings"}
            onClick={() => navigate("/settings")}
          />
        </Stack>
        <Divider my="xs" />

        <ScrollArea h="calc(100vh - 280px)" type="auto" offsetScrollbars>
          <Stack gap="xs">
            {loading ? (
              <Group justify="center" p="md">
                <Loader size="sm" />
              </Group>
            ) : error ? (
              <Text c="dimmed" size="sm" ta="center">
                Error loading chats
              </Text>
            ) : chats?.length === 0 ? (
              <Text c="dimmed" size="sm" ta="center">
                No chats yet
              </Text>
            ) : (
              chats.map(chat => (
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
                    <Group justify="space-between" wrap="nowrap" className={classes.chatItem}>
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
              ))
            )}
          </Stack>
        </ScrollArea>
      </Stack>
    </Stack>
  );
};

export default NavbarContent;
