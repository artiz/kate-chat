import React from "react";
import { Modal, Button, Group, Text, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface DeleteMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleteSingle: () => void;
  onDeleteWithFollowing?: () => void;
}

export const DeleteMessageModal: React.FC<DeleteMessageModalProps> = ({
  isOpen,
  onClose,
  onDeleteSingle,
  onDeleteWithFollowing,
}) => {
  const { t } = useTranslation();
  return (
    <Modal opened={isOpen} onClose={onClose} title={t("chat.deleteMessageTitle")} centered>
      <Stack>
        <Text>{t("chat.deleteMessagePrompt")}</Text>

        <Group mt="md">
          <Button variant="outline" color="red" onClick={onDeleteSingle}>
            {onDeleteWithFollowing ? t("chat.onlyThisMessage") : t("chat.deleteMessageTitle")}
          </Button>
          {onDeleteWithFollowing && (
            <Button color="red" onClick={onDeleteWithFollowing}>
              {t("chat.thisAndFollowing")}
            </Button>
          )}
          <Button ms="4" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
