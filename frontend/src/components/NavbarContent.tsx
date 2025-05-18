"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { gql, useQuery } from "@apollo/client";
import { Stack, Button, NavLink, Text, Group, Loader, Divider, ScrollArea } from "@mantine/core";
import { IconPlus, IconSettings, IconMessage, IconRobot, IconBrandWechat } from "@tabler/icons-react";

// Define the query to fetch user's chats
const GET_CHATS_QUERY = gql`
  query GetUserChats($input: GetChatsInput!) {
    getChats(input: $input) {
      chats {
        id
        title
        updatedAt
      }
      total
      hasMore
    }
  }
`;

// Define the mutation to create a new chat
const CREATE_CHAT_MUTATION = gql`
  mutation CreateNewChat($input: CreateChatInput!) {
    createChat(input: $input) {
      id
      title
    }
  }
`;

export default function NavbarContent() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  // Query for user's chats with pagination
  const { data, loading, error, refetch } = useQuery(GET_CHATS_QUERY, {
    variables: {
      input: {
        limit: 20,
        offset: 0,
      },
    },
    fetchPolicy: "cache-and-network",
  });

  // Update current chat ID from URL
  useEffect(() => {
    if (pathname.startsWith("/chat/")) {
      const id = pathname.split("/").pop();
      if (id) {
        setCurrentChatId(id);
      }
    }
  }, [pathname]);

  // Handle navigation to create new chat
  const handleNewChat = () => {
    router.push("/chat/new");
  };

  // Handle navigation to chat
  const handleChatClick = (id: string) => {
    router.push(`/chat/${id}`);
  };

  // Handle navigation to models page
  const handleModelsClick = () => {
    router.push("/models");
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
            ) : data?.getChats?.chats?.length === 0 ? (
              <Text c="dimmed" size="sm" ta="center">
                No chats yet
              </Text>
            ) : (
              data?.getChats?.chats.map((chat: any) => (
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
          active={pathname === "/models"}
          onClick={handleModelsClick}
        />
        <NavLink
          label="Settings"
          leftSection={<IconSettings size={16} />}
          active={pathname === "/settings"}
          onClick={() => router.push("/settings")}
        />
      </Stack>
    </Stack>
  );
}
