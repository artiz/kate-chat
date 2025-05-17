"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Burger, Group, Avatar, Text, UnstyledButton, Menu, Divider, Loader, Center } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconUser, IconLogout, IconSettings, IconChevronRight } from "@tabler/icons-react";
import NavbarContent from "@/components/NavbarContent";
import { useQuery, gql } from "@apollo/client";

// Current User Query
const CURRENT_USER_QUERY = gql`
  query CurrentUser {
    currentUser {
      id
      email
      firstName
      lastName
    }
  }
`;

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const [opened, { toggle }] = useDisclosure();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  // Load current user data
  const { data, loading, error } = useQuery(CURRENT_USER_QUERY, {
    fetchPolicy: "network-only",
  });

  // Handle authentication on mount
  useEffect(() => {
    setMounted(true);

    // Check if user is authenticated
    const token = localStorage.getItem("auth-token");
    if (!token) {
      router.push("/login");
    }
  }, [router]);

  // Redirect if not authenticated or error loading user
  useEffect(() => {
    if (mounted && !loading) {
      if (error || !data?.currentUser) {
        // Clear any stale auth data
        localStorage.removeItem("auth-token");
        localStorage.removeItem("user-data");
        router.push("/login");
      }
    }
  }, [mounted, loading, error, data, router]);

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem("auth-token");
    localStorage.removeItem("user-data");
    router.push("/login");
  };

  // Show loading indicator while checking authentication
  if (loading || !mounted || !data?.currentUser) {
    return (
      <Center h="100vh">
        <Loader size="xl" />
      </Center>
    );
  }

  // User data
  const user = data.currentUser;
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
              <Menu.Item leftSection={<IconSettings size={14} />}>Settings</Menu.Item>
              <Divider />
              <Menu.Item leftSection={<IconLogout size={14} />} onClick={handleLogout} color="red">
                Logout
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <NavbarContent />
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
