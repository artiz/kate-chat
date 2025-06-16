import React, { useState, useEffect, useCallback } from "react";
import { useApolloClient } from "@apollo/client";
import { Image, Text, Group, Stack, ActionIcon, Modal, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useNavigate } from "react-router-dom";
import { GET_ALL_IMAGES, GetAllImagesResponse, LibraryImage, GetImagesInput } from "../../store/services/graphql";
import { IconExternalLink } from "@tabler/icons-react";
import { ok } from "@/utils/assert";

interface IProps {
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  createdAt?: string;
  chatId?: string;
  chatTitle?: string;
  onClose: () => void;
}

export const ImageModal: React.FC<IProps> = ({
  fileName,
  fileUrl,
  mimeType,
  createdAt,
  chatId,
  chatTitle,
  onClose,
}) => {
  const navigate = useNavigate();
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

  const navigateToChat = useCallback(() => {
    ok(chatId);
    navigate(`/chat/${chatId}`);
    handleClose();
  }, [navigate, chatId, handleClose]);

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

            {chatId && (
              <Group gap="xs">
                <Tooltip label="Open in chat">
                  <ActionIcon variant="light" onClick={navigateToChat}>
                    <IconExternalLink size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            )}
          </Group>

          {chatId && (
            <Text size="sm" c="dimmed">
              From:{" "}
              <Text span c="blue" style={{ cursor: "pointer" }} onClick={navigateToChat}>
                {chatTitle}
              </Text>
            </Text>
          )}
        </Stack>
      )}
    </Modal>
  );
};
