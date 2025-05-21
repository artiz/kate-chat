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
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconUser, IconLogout, IconSettings, IconChevronRight, IconSun, IconMoon } from "@tabler/icons-react";
import { useDispatch } from "react-redux";
import { useAppSelector } from "../store";
import { logout } from "../store/slices/authSlice";
import { clearUser } from "../store/slices/userSlice";
import NavbarContent from "./NavbarContent";
import { useTheme } from "../hooks/useTheme";

const MainLayout: React.FC = () => {
  const [opened, { toggle }] = useDisclosure();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { colorScheme, toggleColorScheme } = useTheme();

  // Get user data from Redux store
  const user = useAppSelector(state => state.user.currentUser);

  // Handle logout
  const handleLogout = () => {
    dispatch(logout());
    dispatch(clearUser());
    navigate("/login");
  };

  if (!user) {
    return null;
  }

  // User data for display
  const userInitials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text size="lg" fw={700}>
              KateChat
            </Text>
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
                    <Avatar color="blue" radius="xl">
                      {userInitials}
                    </Avatar>
                    <div>
                      <Text size="sm" fw={500}>
                        {user.firstName} {user.lastName}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {user.email}
                      </Text>
                    </div>
                    <IconChevronRight size={18} stroke={1.5} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Item leftSection={<IconUser size={14} />}>Profile</Menu.Item>
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

      <AppShell.Navbar p="md">
        <NavbarContent />
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
};

export default MainLayout;
