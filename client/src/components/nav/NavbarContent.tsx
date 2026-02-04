import React, { useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLocalStorage } from "@mantine/hooks";
import {
  Stack,
  Button,
  NavLink,
  Divider,
  ScrollArea,
  AppShell,
  Group,
  ActionIcon,
  Collapse,
  Tooltip,
  Flex,
} from "@mantine/core";
import {
  IconSettings,
  IconRobot,
  IconPhoto,
  IconShield,
  IconBrandGithub,
  IconFile,
  IconFileCv,
  IconMessagePlus,
  IconSettingsFilled,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from "@tabler/icons-react";
import { useAppSelector } from "../../store";
import { ChatsNavSection } from "./ChatsNavSection";
import { UserRole } from "@/store/slices/userSlice";

import styles from "./NavbarContent.module.scss";

interface IProps {
  navbarToggle?: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

const NavbarContent: React.FC<IProps> = ({ navbarToggle, expanded = true, onToggleExpand }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useLocalStorage<boolean>({
    key: "advanced-settings-menu-open",
    defaultValue: false,
  });

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

  useEffect(() => {
    if (chats.length === 0) {
      setMenuOpen(true);
    }
  }, [chats]);

  const toggleMenu = (): void => {
    setMenuOpen(p => !p);
  };

  return (
    <>
      <AppShell.Section>
        <Stack h="100%" justify="space-between" gap="0">
          <Flex
            p="xs"
            gap="xs"
            justify={expanded ? "space-between" : "center"}
            wrap="wrap"
            align="flex-start"
            direction="row"
          >
            <Group>
              {expanded ? (
                <Button
                  leftSection={<IconMessagePlus size={16} />}
                  disabled={newChatDisabled}
                  variant="light"
                  onClick={handleNewChat}
                  style={{ flex: 1 }}
                >
                  New Chat
                </Button>
              ) : (
                <Tooltip label="New Chat" position="right">
                  <ActionIcon disabled={newChatDisabled} variant="light" onClick={handleNewChat} size="lg">
                    <IconMessagePlus size={20} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>

            <Group>
              {expanded && (
                <Tooltip label="Advanced Settings">
                  <ActionIcon variant="subtle" onClick={toggleMenu} size="lg">
                    {menuOpen ? <IconSettingsFilled size={24} /> : <IconSettings size={24} />}
                  </ActionIcon>
                </Tooltip>
              )}
              {onToggleExpand && (
                <Tooltip label={expanded ? "Collapse Sidebar" : "Expand Sidebar"}>
                  <ActionIcon variant="subtle" onClick={onToggleExpand} size="lg" color="gray">
                    {expanded ? <IconLayoutSidebarLeftCollapse size={20} /> : <IconLayoutSidebarLeftExpand size={20} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Flex>

          <Collapse in={menuOpen || !expanded}>
            <Divider m="0" />

            <Stack gap="0" className={styles.navLinks} align={!expanded ? "center" : "stretch"}>
              <Tooltip label="Models" position="right" disabled={expanded}>
                <NavLink
                  label={expanded ? "Models" : null}
                  leftSection={<IconRobot size={16} />}
                  active={location.pathname === "/models"}
                  onClick={handleSectionClick("/models")}
                />
              </Tooltip>
              <Tooltip label="Settings" position="right" disabled={expanded}>
                <NavLink
                  label={expanded ? "Settings" : null}
                  leftSection={<IconSettings size={16} />}
                  active={location.pathname === "/settings"}
                  onClick={handleSectionClick("/settings")}
                />
              </Tooltip>
              <Tooltip label="Library" position="right" disabled={expanded}>
                <NavLink
                  label={expanded ? "Library" : null}
                  leftSection={<IconPhoto size={16} />}
                  active={location.pathname === "/library"}
                  onClick={handleSectionClick("/library")}
                />
              </Tooltip>
              {appConfig?.ragEnabled && (
                <Tooltip label="Documents" position="right" disabled={expanded}>
                  <NavLink
                    label={expanded ? "Documents" : null}
                    leftSection={<IconFile size={16} />}
                    active={location.pathname === "/documents"}
                    color="blue"
                    onClick={handleSectionClick("/documents")}
                  />
                </Tooltip>
              )}
              {currentUser?.role === UserRole.ADMIN && (
                <Tooltip label="Admin" position="right" disabled={expanded}>
                  <NavLink
                    label={expanded ? "Admin" : null}
                    leftSection={<IconShield size={16} />}
                    active={location.pathname === "/admin"}
                    onClick={handleSectionClick("/admin")}
                  />
                </Tooltip>
              )}
            </Stack>

            <Divider mb="0" />
          </Collapse>
        </Stack>
      </AppShell.Section>
      <AppShell.Section grow component={ScrollArea} type="auto" scrollbarSize="12" p="0">
        <ChatsNavSection navbarToggle={navbarToggle} expanded={expanded} onToggleExpand={onToggleExpand} />
      </AppShell.Section>
      <AppShell.Section p="sm">
        <Group justify={expanded ? "flex-start" : "center"} gap="xs">
          <Tooltip label="Project GitHub Repository" position="right" disabled={expanded}>
            <ActionIcon
              component="a"
              variant="subtle"
              href="https://github.com/artiz/kate-chat"
              target="_blank"
              color="dark"
              title="Project GitHub Repository"
            >
              <IconBrandGithub size={24} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Author's CV" position="right" disabled={expanded}>
            <ActionIcon
              component="a"
              variant="subtle"
              href="https://artiz.github.io/"
              target="_blank"
              color="indigo"
              title="Author's CV"
            >
              <IconFileCv size={24} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </AppShell.Section>
    </>
  );
};

export default NavbarContent;
