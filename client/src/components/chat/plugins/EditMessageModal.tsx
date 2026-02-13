import React from "react";
import { Modal, Button, Group, Text, Stack, Textarea } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface EditMessageModalProps {
  isOpen: boolean;
  content: string;
  onContentChange: (content: string) => void;
  onClose: () => void;
  onSave: () => void;
  loading?: boolean;
}

export const EditMessageModal: React.FC<EditMessageModalProps> = ({
  isOpen,
  content,
  onContentChange,
  onClose,
  onSave,
  loading = false,
}) => {
  const { t } = useTranslation();
  return (
    <Modal opened={isOpen} onClose={onClose} title={t("chat.editMessageTitle")} centered size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          {t("chat.editMessageWarning")}
        </Text>

        <Textarea
          value={content}
          onChange={e => onContentChange(e.currentTarget.value)}
          placeholder={t("chat.enterMessage")}
          autosize
          minRows={3}
          maxRows={10}
          autoFocus
        />

        <Group mt="md" justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onSave} loading={loading} disabled={!content.trim()}>
            {t("chat.saveAndRegenerate")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
