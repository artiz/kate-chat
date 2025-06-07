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

        <Group mt="md">
          <Button variant="outline" color="red" onClick={onDeleteSingle}>
            Only this message
          </Button>
          <Button color="red" onClick={onDeleteWithFollowing}>
            This one and all following
          </Button>
          <Button ms="4" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
