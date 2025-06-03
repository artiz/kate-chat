import React from "react";
import { Modal, Button, Group, Text, Stack } from "@mantine/core";

interface DeleteMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleteSingle: () => void;
  onDeleteWithFollowing: () => void;
}

export const DeleteMessageModal: React.FC<DeleteMessageModalProps> = ({
  isOpen,
  onClose,
  onDeleteSingle,
  onDeleteWithFollowing,
}) => {
  return (
    <Modal opened={isOpen} onClose={onClose} title="Delete Message" centered>
      <Stack>
        <Text>What would you like to delete?</Text>

        <Group justify="space-between" mt="md">
          <Button variant="outline" color="red" onClick={onDeleteSingle}>
            Only this message
          </Button>
          <Button color="red" onClick={onDeleteWithFollowing}>
            This message and all following
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
