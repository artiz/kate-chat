import { useAppSelector } from "@/store";
import { Chat } from "@/types/graphql";
import { useMemo } from "react";

export interface ChatLink {
  id: string;
  folderId?: string;
  isPinned?: boolean;
}

export const useChat = (link: ChatLink): Chat | undefined => {
  const { chats, pinnedChats } = useAppSelector(state => state.chats);
  const folderChats = useAppSelector(state => state.folders.folderChats);
  const { id, folderId, isPinned } = link;

  const chat = useMemo(() => {
    if (isPinned) {
      let chat = pinnedChats.find(c => c.id === id);
      if (chat) return chat;

      if (folderId) {
        chat = folderChats[folderId].chats.find(c => c.id === id);
      } else {
        for (const folderId in folderChats) {
          chat = folderChats[folderId].chats.find(c => c.id === id);
          if (chat) return chat;
        }
      }

      return chat;
    }

    return chats.find(c => c.id === id);
  }, [id, chats, pinnedChats, folderChats]);

  return chat;
};
