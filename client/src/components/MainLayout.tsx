import React from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AppShell,
  Burger,
  Group,
  Avatar,
  Text,
  UnstyledButton,
  Menu,
  Divider,
  ActionIcon,
  Tooltip,
  em,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconUser, IconLogout, IconSettings, IconChevronRight, IconSun, IconMoon } from "@tabler/icons-react";
import { useDispatch } from "react-redux";
import { useAppSelector } from "../store";
import { logout } from "../store/slices/authSlice";
import { clearUser } from "../store/slices/userSlice";
import NavbarContent from "./nav/NavbarContent";
import { useTheme } from "../hooks/useTheme";

export const MainLayout: React.FC = () => {
  const [opened, { toggle }] = useDisclosure();
  const isMobile = useMediaQuery(`(max-width: ${em(750)})`);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { colorScheme, toggleColorScheme } = useTheme();

  // Get user data from Redux store
  const { currentUser, appConfig } = useAppSelector(state => state.user);

  // Handle logout
  const handleLogout = () => {
    dispatch(logout());
    dispatch(clearUser());
    navigate("/login");
  };

  if (!currentUser) {
    return null;
  }

  // User data for display
  const userInitials = `${currentUser?.firstName?.[0]}${currentUser?.lastName?.[0]}`.toUpperCase();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="0"
      withBorder
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text size="lg" fw={700}>
              KateChat
            </Text>
            {appConfig?.demoMode && (
              <Tooltip
                label={`Demo mode, max chats per user: ${appConfig.maxChats},
                      max chat messages: ${appConfig.maxChatMessages},
                      max images: ${appConfig.maxImages}`}
                color="red"
              >
                <Text size="sm" c="red" fw={500}>
                  Demo Mode
                </Text>
              </Tooltip>
            )}
          </Group>
          <Group>
            <Tooltip label={colorScheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              <ActionIcon
                variant="subtle"
                onClick={() => {
                  toggleColorScheme();
                  // Force UI update
                  setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
                }}
                aria-label="Toggle theme"
              >
                {colorScheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>

            <Menu shadow="md" width={200} position="bottom-end">
              <Menu.Target>
                <UnstyledButton>
                  <Group gap={8}>
                    <Avatar color="blue" radius="xl" src={currentUser?.avatarUrl}>
                      {userInitials}
                    </Avatar>
                    <div>
                      <Text visibleFrom="sm" size="sm" fw={500}>
                        {currentUser?.firstName} {currentUser?.lastName}
                      </Text>
                      <Text visibleFrom="sm" size="xs" c="dimmed">
                        {currentUser?.email}
                      </Text>
                    </div>
                    <IconChevronRight size={18} stroke={1.5} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Item leftSection={<IconSettings size={14} />} onClick={() => navigate("/settings")}>
                  Settings
                </Menu.Item>
                <Divider />
                <Menu.Item leftSection={<IconLogout size={14} />} onClick={handleLogout} color="red">
                  Logout
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="0">
        <NavbarContent navbarToggle={isMobile ? toggle : undefined} />
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
};
