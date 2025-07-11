import React from "react";
import { Modal, Button, Group, Text, Stack, Textarea } from "@mantine/core";

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
  return (
    <Modal opened={isOpen} onClose={onClose} title="Edit Message" centered size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Editing this message will regenerate all following AI responses in the conversation.
        </Text>

        <Textarea
          value={content}
          onChange={e => onContentChange(e.currentTarget.value)}
          placeholder="Enter your message..."
          autosize
          minRows={3}
          maxRows={10}
          autoFocus
        />

        <Group mt="md" justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onSave} loading={loading} disabled={!content.trim()}>
            Save & Regenerate
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
