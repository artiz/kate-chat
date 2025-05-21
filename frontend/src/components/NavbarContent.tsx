import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Stack, Button, NavLink, Text, Group, Loader, Divider, ScrollArea } from "@mantine/core";
import { IconPlus, IconSettings, IconMessage, IconRobot } from "@tabler/icons-react";
import { useAppSelector } from "../store";

const NavbarContent: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  // Get chats from Redux store
  const { chats, loading, error } = useAppSelector(state => state.chats);

  // Update current chat ID from URL
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith("/chat/")) {
      const id = path.split("/").pop();
      if (id && id !== "new") {
        setCurrentChatId(id);
      }
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

  return (
    <Stack h="100%" justify="space-between" gap="xs">
      <Stack gap="xs">
        <Button leftSection={<IconPlus size={16} />} variant="light" onClick={handleNewChat} fullWidth>
          New Chat
        </Button>

        <Divider my="xs" />

        <ScrollArea h="calc(100vh - 180px)" scrollbarSize={6}>
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
                <NavLink
                  key={chat.id}
                  active={chat.id === currentChatId}
                  label={chat.title || "Untitled Chat"}
                  leftSection={<IconMessage size={16} />}
                  onClick={() => handleChatClick(chat.id)}
                />
              ))
            )}
          </Stack>
        </ScrollArea>
      </Stack>

      <Stack gap="xs">
        <Divider my="xs" />
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
    </Stack>
  );
};

export default NavbarContent;
