import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Stack, Button, NavLink, Divider, ScrollArea } from "@mantine/core";
import { IconPlus, IconSettings, IconRobot, IconPhoto } from "@tabler/icons-react";
import { useAppSelector } from "../../store";
import { ChatsNavSection } from "./ChatsNavSection";

interface IProps {
  navbarToggle?: () => void;
}

const NavbarContent: React.FC<IProps> = ({ navbarToggle }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Get chats from Redux store
  const { chats } = useAppSelector(state => state.chats);
  const { providers } = useAppSelector(state => state.models);
  const { appConfig } = useAppSelector(state => state.user);

  const noActiveProviders = useMemo(() => {
    return providers.length === 0 || !providers.some(provider => provider.isConnected);
  }, [providers]);

  const newChatDisabled = useMemo(() => {
    return noActiveProviders || (appConfig?.demoMode && chats.length > (appConfig.maxChats ?? 0));
  }, [noActiveProviders, appConfig, chats]);

  // Handle navigation to create new chat
  const handleNewChat = () => {
    navbarToggle?.();
    navigate("/chat/new");
  };

  // Handle navigation to models page
  const handleModelsClick = () => {
    navbarToggle?.();
    navigate("/models");
  };

  return (
    <Stack h="100%" justify="space-between" gap="0">
      <Stack gap="0">
        <Button
          leftSection={<IconPlus size={16} />}
          disabled={newChatDisabled}
          variant="light"
          onClick={handleNewChat}
          fullWidth
        >
          New Chat
        </Button>

        <Divider my="xs" />

        <Stack gap="0">
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
          <NavLink
            label="Library"
            leftSection={<IconPhoto size={16} />}
            active={location.pathname === "/library"}
            onClick={() => {
              navbarToggle?.();
              navigate("/library");
            }}
          />
        </Stack>
        <Divider my="xs" />

        <ScrollArea h="calc(100vh - 280px)" type="auto">
          <ChatsNavSection />
        </ScrollArea>
      </Stack>
    </Stack>
  );
};

export default NavbarContent;
