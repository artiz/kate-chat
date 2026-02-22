import React, { useState } from "react";
import { Modal, TextInput, Button, Group, Stack, Text } from "@mantine/core";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useAppDispatch } from "@/store";
import { CREATE_FOLDER_MUTATION } from "@/store/services/graphql.queries";
import { addFolder } from "@/store/slices/folderSlice";
import { ChatFolder } from "@/types/graphql";
import { FolderColorPicker } from "./FolderColorPicker";

interface IProps {
  isOpen: boolean;
  onClose: () => void;
  parentFolderId?: string;
}

export const NewFolderModal: React.FC<IProps> = ({ isOpen, onClose, parentFolderId }) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | undefined>(undefined);

  const [createFolder, { loading }] = useMutation<{ createFolder: ChatFolder }>(CREATE_FOLDER_MUTATION, {
    onCompleted: data => {
      dispatch(addFolder(data.createFolder));
      handleClose();
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("chat.folder.failedToCreate"),
        color: "red",
      });
    },
  });

  const handleClose = () => {
    setName("");
    setColor(undefined);
    onClose();
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    createFolder({
      variables: {
        input: {
          name: name.trim(),
          color,
          parentId: parentFolderId,
        },
      },
    });
  };

  return (
    <Modal opened={isOpen} onClose={handleClose} title={t("chat.folder.createFolder")} size="sm">
      <Stack gap="sm">
        <TextInput
          label={t("chat.folder.name")}
          placeholder={t("chat.folder.namePlaceholder")}
          value={name}
          onChange={e => setName(e.currentTarget.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          autoFocus
        />
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            {t("chat.folder.color")}
          </Text>
          <FolderColorPicker value={color} onChange={setColor} />
        </Stack>
        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} loading={loading} disabled={!name.trim()}>
            {t("chat.folder.createFolder")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
