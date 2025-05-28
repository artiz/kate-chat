import React from "react";
import { Container } from "@mantine/core";
import { ChatList as ChatListComponent } from "@/components/chat/ChatList";

export const ChatList: React.FC = () => {
  return (
    <Container size="lg" py="xl">
      <ChatListComponent />
    </Container>
  );
};
