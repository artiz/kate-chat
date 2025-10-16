import React, { useEffect, useCallback } from "react";
import { Image, Text, Group, Stack, ActionIcon, Modal, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconExternalLink } from "@tabler/icons-react";

interface IProps {
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  createdAt?: string;
  onOpenSource?: () => void;
  sourceTitle?: string;
  onClose: () => void;
}

export const ImagePopup: React.FC<IProps> = ({
  fileName,
  fileUrl,
  mimeType,
  createdAt,
  onOpenSource,
  sourceTitle,
  onClose,
}) => {
  const [opened, { open, close }] = useDisclosure(false);

  useEffect(() => {
    if (fileUrl) {
      open();
    }
  }, [fileUrl, open]);

  const handleClose = useCallback(() => {
    onClose();
    close();
  }, [onClose, close]);

  const navigateToSource = useCallback(() => {
    onOpenSource?.();
    handleClose();
  }, [onOpenSource, handleClose]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Image Preview Modal
  return (
    <Modal opened={opened} onClose={handleClose} size="xl" title="Image Preview" centered>
      {fileUrl && (
        <Stack gap="md">
          <Image src={fileUrl} alt={fileName} fit="contain" mah="70vh" />

          <Group justify="space-between">
            <div>
              <Text size="sm" fw={500}>
                {fileName}
              </Text>
              <Text size="xs" c="dimmed">
                {createdAt ? formatDate(createdAt) + " •" : ""} {mimeType}
              </Text>
            </div>

            {onOpenSource && (
              <Group gap="xs">
                <Tooltip label="Open source">
                  <ActionIcon variant="light" onClick={navigateToSource}>
                    <IconExternalLink size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            )}
          </Group>

          {onOpenSource && (
            <Text size="sm" c="dimmed">
              From:{" "}
              <Text span c="blue" style={{ cursor: "pointer" }} onClick={navigateToSource}>
                {sourceTitle || "source"}
              </Text>
            </Text>
          )}
        </Stack>
      )}
    </Modal>
  );
};
