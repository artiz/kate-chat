import React, { useState } from "react";
import { Modal, Button, Group, Stack, NavLink, ScrollArea, Text, Loader } from "@mantine/core";
import { useMutation, useQuery } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { IconFolder, IconFolderOpen, IconPinned } from "@tabler/icons-react";
import { useMantineTheme } from "@mantine/core";
import { useAppDispatch } from "@/store";
import { GET_ALL_FOLDERS, UPDATE_CHAT_MUTATION } from "@/store/services/graphql.queries";
import { removeFolderChat } from "@/store/slices/folderSlice";
import { updateChat } from "@/store/slices/chatSlice";
import { Chat, ChatFolder } from "@/types/graphql";

interface IProps {
  isOpen: boolean;
  onClose: () => void;
  chat: Chat;
}

interface FolderNodeProps {
  folder: ChatFolder;
  allFolders: ChatFolder[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  depth?: number;
}

const FolderNode: React.FC<FolderNodeProps> = ({ folder, allFolders, selected, onSelect, depth = 0 }) => {
  const [open, setOpen] = useState(false);
  const theme = useMantineTheme();
  const children = allFolders.filter(f => f.parentId === folder.id);
  const isSelected = selected === folder.id;
  const color = folder.color ? theme.colors[folder.color]?.[6] : undefined;

  return (
    <>
      <NavLink
        label={folder.name}
        leftSection={
          open && children.length > 0 ? (
            <IconFolderOpen size={16} color={color} />
          ) : (
            <IconFolder size={16} color={color} />
          )
        }
        active={isSelected}
        onClick={() => {
          onSelect(folder.id);
          if (children.length > 0) setOpen(o => !o);
        }}
        pl={`calc(var(--mantine-spacing-sm) + ${depth * 16}px)`}
      />
      {open &&
        children.map(child => (
          <FolderNode
            key={child.id}
            folder={child}
            allFolders={allFolders}
            selected={selected}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </>
  );
};

export const MoveToChatModal: React.FC<IProps> = ({ isOpen, onClose, chat }) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(chat.folderId ?? null);

  const { data, loading: foldersLoading } = useQuery<{ getAllFolders: { folders: ChatFolder[] } }>(GET_ALL_FOLDERS, {
    skip: !isOpen,
    fetchPolicy: "network-only",
  });

  const [updateChatMutation, { loading }] = useMutation(UPDATE_CHAT_MUTATION, {
    onCompleted: data => {
      const updatedChat: Chat = data.updateChat;
      // If moved out of a folder, remove from folder's chat list
      if (chat.folderId && !updatedChat.folderId) {
        dispatch(removeFolderChat(chat.id));
      }

      dispatch(updateChat(updatedChat));
      onClose();
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message,
        color: "red",
      });
    },
  });

  const handleConfirm = () => {
    updateChatMutation({
      variables: {
        id: chat.id,
        input: { folderId: selectedFolderId },
      },
    });
  };

  const allFolders = data?.getAllFolders?.folders || [];
  const topLevelFolders = allFolders.filter(f => !f.parentId);

  return (
    <Modal opened={isOpen} onClose={onClose} title={t("chat.moveToFolder")} size="sm">
      <Stack gap="sm">
        {foldersLoading ? (
          <Group justify="center" p="md">
            <Loader size="sm" />
          </Group>
        ) : (
          <>
            <Text size="sm" c="dimmed">
              {chat.title}
            </Text>
            <ScrollArea h={220} type="auto">
              <NavLink
                label={t("chat.noFolder")}
                leftSection={<IconPinned size={16} />}
                active={selectedFolderId === null}
                onClick={() => setSelectedFolderId(null)}
              />
              {topLevelFolders.map(folder => (
                <FolderNode
                  key={folder.id}
                  folder={folder}
                  allFolders={allFolders}
                  selected={selectedFolderId}
                  onSelect={id => setSelectedFolderId(id)}
                />
              ))}
            </ScrollArea>
          </>
        )}
        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleConfirm} loading={loading}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
