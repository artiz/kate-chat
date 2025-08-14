import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Stack, Button, NavLink, Divider, ScrollArea, AppShell } from "@mantine/core";
import {
  IconPlus,
  IconSettings,
  IconRobot,
  IconPhoto,
  IconShield,
  IconBrandGit,
  IconBrandGithub,
  IconFile,
} from "@tabler/icons-react";
import { useAppSelector } from "../../store";
import { ChatsNavSection } from "./ChatsNavSection";
import { UserRole } from "@/store/slices/userSlice";

interface IProps {
  navbarToggle?: () => void;
}

const NavbarContent: React.FC<IProps> = ({ navbarToggle }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Get chats from Redux store
  const { chats } = useAppSelector(state => state.chats);
  const { providers } = useAppSelector(state => state.models);
  const { appConfig, currentUser } = useAppSelector(state => state.user);

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

  // Handle navigation to admin page
  const handleAdminClick = () => {
    navbarToggle?.();
    navigate("/admin");
  };

  return (
    <>
      <AppShell.Section>
        <Stack h="100%" justify="space-between" gap="0">
          <Stack p="md">
            <Button
              leftSection={<IconPlus size={16} />}
              disabled={newChatDisabled}
              variant="light"
              onClick={handleNewChat}
              fullWidth
            >
              New Chat
            </Button>
          </Stack>

          <Divider mt="xs" mb="xs" />

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
            <NavLink
              label="Documents"
              leftSection={<IconFile size={16} />}
              active={location.pathname === "/documents"}
              onClick={() => {
                navbarToggle?.();
                navigate("/documents");
              }}
            />
            {currentUser?.role === UserRole.ADMIN && (
              <NavLink
                label="Admin"
                leftSection={<IconShield size={16} />}
                active={location.pathname === "/admin"}
                onClick={handleAdminClick}
              />
            )}
          </Stack>
          <Divider my="xs" />
        </Stack>
      </AppShell.Section>
      <AppShell.Section grow component={ScrollArea}>
        <ChatsNavSection />
      </AppShell.Section>
      <AppShell.Section p="sm">
        <Button
          component="a"
          variant="transparent"
          href="https://github.com/artiz/kate-chat"
          target="_blank"
          title="GitHub Repository"
        >
          <IconBrandGithub size={24} />
        </Button>
      </AppShell.Section>
    </>
  );
};

export default NavbarContent;
