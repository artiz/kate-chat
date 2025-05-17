"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { gql, useQuery } from "@apollo/client";
import { Center, Loader } from "@mantine/core";

// Query to get the user's most recent chat
const GET_MOST_RECENT_CHAT = gql`
  query GetMostRecentChat {
    getChats(input: { limit: 1, sortBy: "updatedAt", sortOrder: "DESC" }) {
      chats {
        id
      }
    }
  }
`;

export default function ChatPage() {
  const router = useRouter();

  // Query for the most recent chat
  const { data, loading } = useQuery(GET_MOST_RECENT_CHAT, {
    fetchPolicy: "network-only",
  });

  // Redirect to the most recent chat or create a new one
  useEffect(() => {
    if (!loading) {
      const recentChat = data?.getChats?.chats?.[0];

      if (recentChat) {
        // Redirect to the most recent chat
        router.push(`/chat/${recentChat.id}`);
      } else {
        // No recent chats, create a new one
        router.push("/chat/new");
      }
    }
  }, [loading, data, router]);

  // Show loading state while redirecting
  return (
    <Center h="100%">
      <Loader size="xl" />
    </Center>
  );
}
