import React from "react";
import { Modal, Button, Group, Text, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  return (
    <Modal opened={isOpen} onClose={onClose} title={title || t("Confirm Deletion")} centered>
      <Stack>
        <Text style={{ wordBreak: "break-word" }}>
          {message || t("Are you sure you want to delete this item? This action cannot be undone.")}
        </Text>

        <Group mt="md" justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {cancelLabel || t("Cancel")}
          </Button>
          <Button color="red" onClick={onConfirm} loading={isLoading}>
            {confirmLabel || t("Delete")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
