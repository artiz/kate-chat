import React, { useCallback, useMemo } from "react";
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
  Tooltip,
  Flex,
  Accordion,
  Box,
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
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconBrain,
  IconPlugConnected,
  IconWifi,
  IconUser,
  IconKey,
  IconUsers,
  IconBooks,
  IconMessages,
  IconNetwork,
  IconLink,
} from "@tabler/icons-react";
import { useAppSelector } from "../../store";
import { ChatsNavSection } from "./ChatsNavSection";
import { UserRole } from "@/store/slices/userSlice";
import { getClientNavLinks, NavLinkIcon } from "@/global-config";

import styles from "./NavbarContent.module.scss";
import accordionClasses from "./MenuAccordion.module.scss";

interface IProps {
  navbarToggle?: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

const NavbarContent: React.FC<IProps> = ({ navbarToggle, expanded = true, onToggleExpand }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useLocalStorage<string>({
    key: "settings-menu",
    defaultValue: "",
  });

  // Get chats from Redux store
  const { chats } = useAppSelector(state => state.chats);
  const { providers } = useAppSelector(state => state.models);
  const { appConfig, currentUser } = useAppSelector(state => state.user);
  const navLinks = useMemo(() => getClientNavLinks(), []);

  const isLocalUser = useMemo(() => {
    return !currentUser?.authProvider || currentUser?.authProvider === "local";
  }, [currentUser]);

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

  const renderNavIcon = useCallback((icon: NavLinkIcon) => {
    switch (icon) {
      case "cv":
        return <IconFileCv size={24} />;
      case "github":
        return <IconBrandGithub size={24} />;
      case "network":
        return <IconNetwork size={24} />;
      case "link":
      default:
        return <IconLink size={24} />;
    }
  }, []);

  return (
    <>
      <AppShell.Section>
        <Stack h="100%" justify="space-between" gap="0">
          <Flex
            p="sm"
            gap="sm"
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
                  onClick={handleNewChat}
                  style={{ flex: 1 }}
                >
                  New Chat
                </Button>
              ) : (
                <Tooltip label="New Chat" position="right">
                  <ActionIcon disabled={newChatDisabled} onClick={handleNewChat} size="lg">
                    <IconMessagePlus size={20} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>

            <Group>
              {onToggleExpand && (
                <Tooltip label={expanded ? "Collapse Sidebar" : "Expand Sidebar"}>
                  <ActionIcon variant="subtle" onClick={onToggleExpand} size="lg" color="gray">
                    {expanded ? <IconLayoutSidebarLeftCollapse size={20} /> : <IconLayoutSidebarLeftExpand size={20} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Flex>
          <Divider m="0" p="0" />

          <Stack className={styles.navLinks}>
            <Accordion
              multiple
              p="0"
              variant="default"
              chevronSize="lg"
              classNames={accordionClasses}
              value={menuOpen?.split(",").filter(Boolean)}
              onChange={v => setMenuOpen(v ? v.join(",") : "")}
            >
              {/* Settings Section */}
              <Accordion.Item key="settings" value="settings">
                <Accordion.Control icon={expanded ? <IconSettings /> : undefined}>
                  {expanded ? "Settings" : null}
                </Accordion.Control>
                <Accordion.Panel>
                  <Tooltip label="Models" position="right" disabled={expanded}>
                    <NavLink
                      label={expanded ? "Models" : null}
                      leftSection={<IconRobot size={16} />}
                      active={location.pathname === "/models"}
                      onClick={handleSectionClick("/models")}
                    />
                  </Tooltip>
                  <Tooltip label="AI" position="right" disabled={expanded}>
                    <NavLink
                      label={expanded ? "AI" : null}
                      leftSection={<IconBrain size={16} />}
                      active={location.pathname === "/ai-settings"}
                      onClick={handleSectionClick("/ai-settings")}
                    />
                  </Tooltip>
                  {currentUser?.role === UserRole.ADMIN && (
                    <Tooltip label="MCP Servers" position="right" disabled={expanded}>
                      <NavLink
                        label={expanded ? "MCP Servers" : null}
                        leftSection={<IconPlugConnected size={16} />}
                        active={location.pathname === "/mcp-servers"}
                        onClick={handleSectionClick("/mcp-servers")}
                      />
                    </Tooltip>
                  )}
                  <Tooltip label="Connectivity" position="right" disabled={expanded}>
                    <NavLink
                      label={expanded ? "Connectivity" : null}
                      leftSection={<IconWifi size={16} />}
                      active={location.pathname === "/connectivity"}
                      onClick={handleSectionClick("/connectivity")}
                    />
                  </Tooltip>

                  {expanded && (
                    <Group className={accordionClasses.header}>
                      <IconShield size="16" /> Admin
                    </Group>
                  )}

                  <Tooltip label="Profile" position="right" disabled={expanded}>
                    <NavLink
                      label={expanded ? "Profile" : null}
                      leftSection={<IconUser size={16} />}
                      active={location.pathname === "/profile"}
                      onClick={handleSectionClick("/profile")}
                    />
                  </Tooltip>
                  {isLocalUser && (
                    <Tooltip label="Password" position="right" disabled={expanded}>
                      <NavLink
                        label={expanded ? "Password" : null}
                        leftSection={<IconKey size={16} />}
                        active={location.pathname === "/password"}
                        onClick={handleSectionClick("/password")}
                      />
                    </Tooltip>
                  )}
                  {currentUser?.role === UserRole.ADMIN && (
                    <Tooltip label="Users" position="right" disabled={expanded}>
                      <NavLink
                        label={expanded ? "Users" : null}
                        leftSection={<IconUsers size={16} />}
                        active={location.pathname === "/users"}
                        onClick={handleSectionClick("/users")}
                      />
                    </Tooltip>
                  )}

                  {expanded && (
                    <Group className={accordionClasses.header}>
                      <IconBooks size="16" /> Library
                    </Group>
                  )}

                  <Tooltip label="Media" position="right" disabled={expanded}>
                    <NavLink
                      label={expanded ? "Media" : null}
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
                        onClick={handleSectionClick("/documents")}
                      />
                    </Tooltip>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Stack>
        </Stack>
      </AppShell.Section>

      {chats?.length > 0 && (
        <AppShell.Section className={styles.chatsSection}>
          <Tooltip label="All Chats" position="right" disabled={expanded}>
            <NavLink
              label={expanded ? "All Chats" : null}
              leftSection={<IconMessages />}
              active={location.pathname === "/chat"}
              onClick={handleSectionClick("/chat")}
            />
          </Tooltip>
        </AppShell.Section>
      )}

      <AppShell.Section grow component={ScrollArea} type="auto" scrollbarSize="12" p="0">
        <ChatsNavSection navbarToggle={navbarToggle} expanded={expanded} onToggleExpand={onToggleExpand} />
      </AppShell.Section>
      <AppShell.Section p="sm">
        <Group justify={expanded ? "flex-start" : "center"} gap="sm">
          {navLinks.map(link => (
            <Tooltip key={link.url} label={link.tooltip} position="right">
              <ActionIcon component="a" variant="subtle" href={link.url} target="_blank" color={link.color || "dark"}>
                {renderNavIcon(link.icon)}
              </ActionIcon>
            </Tooltip>
          ))}
        </Group>
      </AppShell.Section>
    </>
  );
};

export default NavbarContent;
