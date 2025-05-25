import React from "react";
import { useParams } from "react-router-dom";
import { ChatComponent } from "@/components/chat/Chat";

export const Chat: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <ChatComponent chatId={id} />;
};
