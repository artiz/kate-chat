import React, { useCallback, useMemo } from "react";
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
  IconFileCv,
} from "@tabler/icons-react";
import { useAppSelector } from "../../store";
import { ChatsNavSection } from "./ChatsNavSection";
import { UserRole } from "@/store/slices/userSlice";

import styles from "./NavbarContent.module.scss";

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

  const pristineChat = useMemo(() => {
    return chats?.find(chat => chat.isPristine);
  }, [chats]);

  // Handle navigation to create new chat
  const handleNewChat = useCallback(() => {
    navbarToggle?.();
    if (pristineChat) {
      navigate(`/chat/${pristineChat.id}`);
    } else {
      navigate("/chat/new");
    }
  }, [pristineChat, navigate, navbarToggle]);

  // Handle navigation to models page
  const handleSectionClick = (path: string) => () => {
    navbarToggle?.();
    navigate(path);
  };

  return (
    <>
      <AppShell.Section>
        <Stack h="100%" justify="space-between" gap="0">
          <Stack p="sm">
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

          <Divider mt="xs" mb="0" />

          <Stack gap="0" className={styles.navLinks}>
            <NavLink
              label="Models"
              leftSection={<IconRobot size={16} />}
              active={location.pathname === "/models"}
              onClick={handleSectionClick("/models")}
            />
            <NavLink
              label="Settings"
              leftSection={<IconSettings size={16} />}
              active={location.pathname === "/settings"}
              onClick={handleSectionClick("/settings")}
            />
            <NavLink
              label="Library"
              leftSection={<IconPhoto size={16} />}
              active={location.pathname === "/library"}
              onClick={handleSectionClick("/library")}
            />
            {appConfig?.ragEnabled && (
              <NavLink
                label="Documents"
                leftSection={<IconFile size={16} />}
                active={location.pathname === "/documents"}
                color="blue"
                onClick={handleSectionClick("/documents")}
              />
            )}
            {currentUser?.role === UserRole.ADMIN && (
              <NavLink
                label="Admin"
                leftSection={<IconShield size={16} />}
                active={location.pathname === "/admin"}
                onClick={handleSectionClick("/admin")}
              />
            )}
          </Stack>

          <Divider mb="xs" />
        </Stack>
      </AppShell.Section>
      <AppShell.Section grow component={ScrollArea}>
        <ChatsNavSection navbarToggle={navbarToggle} />
      </AppShell.Section>
      <AppShell.Section p="sm">
        <Button
          component="a"
          variant="subtle"
          href="https://github.com/artiz/kate-chat"
          target="_blank"
          color="dark"
          title="Project GitHub Repository"
          p="0"
        >
          <IconBrandGithub size={24} />
        </Button>

        <Button
          component="a"
          variant="subtle"
          href="https://artiz.github.io/"
          target="_blank"
          color="indigo"
          title="Author's CV"
          p="0"
        >
          <IconFileCv size={24} />
        </Button>
      </AppShell.Section>
    </>
  );
};

export default NavbarContent;
