import React, { useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useAppDispatch } from "@/store";
import { UPDATE_CHAT_MUTATION } from "@/store/services/graphql.queries";
import { updateChat } from "@/store/slices/chatSlice";
import { removeFolderChat } from "@/store/slices/folderSlice";
import { Chat } from "@/types/graphql";

interface Props {
  children: React.ReactNode;
}

export const ChatDndProvider: React.FC<Props> = ({ children }) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  // Keep reference to the chat being moved so onCompleted can clean up the source folder
  const pendingRef = useRef<Chat | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require 8px movement before drag starts — prevents accidental drags on clicks
      activationConstraint: { distance: 8 },
    })
  );

  const [updateChatMutation] = useMutation(UPDATE_CHAT_MUTATION, {
    onCompleted: data => {
      const updated: Chat = data.updateChat;
      const prev = pendingRef.current;
      pendingRef.current = null;

      // Remove from old folder if it changed
      if (prev?.folderId && prev.folderId !== updated.folderId) {
        dispatch(removeFolderChat(prev.id));
      }
      dispatch(updateChat(updated));
    },
    onError: error => {
      pendingRef.current = null;
      notifications.show({ title: t("common.error"), message: error.message, color: "red" });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "chat") {
      setActiveChat(data.chat as Chat);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveChat(null);

    if (!over) return;

    const chat = active.data.current?.chat as Chat | undefined;
    if (!chat) return;

    const drop = over.data.current as { type: string; folderId?: string } | undefined;
    if (!drop) return;

    let input: { folderId?: string | null; isPinned?: boolean } | null = null;

    if (drop.type === "folder" && drop.folderId) {
      if (chat.folderId !== drop.folderId) {
        input = { folderId: drop.folderId }; // backend auto-pins when folderId is set
      }
    } else if (drop.type === "pinned") {
      if (chat.folderId || !chat.isPinned) {
        input = { folderId: null, isPinned: true };
      }
    } else if (drop.type === "chats") {
      if (chat.folderId || chat.isPinned) {
        input = { folderId: null, isPinned: false };
      }
    }

    if (!input) return;

    // Optimistic update so the UI responds instantly
    const optimistic: Chat = {
      ...chat,
      folderId: input.folderId !== undefined ? (input.folderId ?? undefined) : chat.folderId,
      isPinned:
        input.isPinned !== undefined
          ? input.isPinned
          : input.folderId
            ? true // folder always pins
            : chat.isPinned,
    };

    if (chat.folderId) dispatch(removeFolderChat(chat.id));
    dispatch(updateChat(optimistic));

    pendingRef.current = chat;
    updateChatMutation({ variables: { id: chat.id, input } });
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {children}
      <DragOverlay dropAnimation={null}>
        {activeChat ? (
          <div
            style={{
              padding: "4px 10px",
              background: "var(--mantine-color-body)",
              border: "1px solid var(--mantine-color-default-border)",
              borderRadius: 6,
              fontSize: "var(--mantine-font-size-sm)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
              whiteSpace: "nowrap",
              maxWidth: 220,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {activeChat.title || t("chat.untitledChat")}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
