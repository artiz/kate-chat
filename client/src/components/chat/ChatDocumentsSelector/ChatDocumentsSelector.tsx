import React, { useMemo, useState } from "react";
import { useQuery } from "@apollo/client";
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  Popover,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  Badge,
} from "@mantine/core";
import { IconFile, IconChevronDown, IconCheck, IconX } from "@tabler/icons-react";
import { Document } from "@/store/services/graphql";

import classes from "./ChatDocumentsSelector.module.scss";
import { DocumentStatus } from "@/types/ai";

interface ChatDocumentsSelectorProps {
  selectedDocIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  disabled?: boolean;
  documents: Document[];
}

export const ChatDocumentsSelector: React.FC<ChatDocumentsSelectorProps> = ({
  selectedDocIds,
  onSelectionChange,
  documents,
  disabled = false,
}) => {
  const [opened, setOpened] = useState(false);

  // Filter documents that are ready for RAG search
  const availableDocuments = useMemo(() => {
    if (!documents) return [];
    return documents.filter(doc => doc.status === DocumentStatus.READY || doc.status === DocumentStatus.SUMMARIZING);
  }, [documents]);

  const selectedDocuments = useMemo(() => {
    return availableDocuments.filter(doc => selectedDocIds.includes(doc.id));
  }, [availableDocuments, selectedDocIds]);

  const handleDocumentToggle = (docId: string) => {
    const newSelection = selectedDocIds.includes(docId)
      ? selectedDocIds.filter(id => id !== docId)
      : [...selectedDocIds, docId];
    onSelectionChange(newSelection);
  };

  const handleSelectAll = () => {
    onSelectionChange(availableDocuments.map(doc => doc.id));
  };

  const handleUnselectAll = () => {
    onSelectionChange([]);
  };

  const isAllSelected = availableDocuments.length > 0 && selectedDocIds.length === availableDocuments.length;
  const isPartiallySelected = selectedDocIds.length > 0 && selectedDocIds.length < availableDocuments.length;

  return (
    <Popover position="bottom-start" withArrow shadow="md" opened={opened} onChange={setOpened}>
      <Popover.Target>
        <Paper className={classes.container} data-disabled={disabled}>
          <Group
            justify="space-between"
            style={{ cursor: disabled ? "not-allowed" : "pointer" }}
            onClick={() => !disabled && setOpened(!opened)}
          >
            <Group gap="xs">
              <IconFile size={16} />
              <div>
                Documents
                {selectedDocuments.length > 0 && (
                  <Badge size="sm" variant="light" color="blue" ml="xs">
                    {selectedDocuments.length} selected
                  </Badge>
                )}
              </div>
            </Group>
            <ActionIcon
              size="sm"
              variant="subtle"
              disabled={disabled}
              style={{
                transform: opened ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            >
              <IconChevronDown size={14} />
            </ActionIcon>
          </Group>
        </Paper>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              Select Documents ({selectedDocuments.length}/{availableDocuments.length})
            </Text>
            <Group gap="xs">
              <Tooltip label="Select All">
                <ActionIcon size="sm" variant="light" color="blue" onClick={handleSelectAll} disabled={isAllSelected}>
                  <IconCheck size={12} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Unselect All">
                <ActionIcon
                  size="sm"
                  variant="light"
                  color="gray"
                  onClick={handleUnselectAll}
                  disabled={selectedDocIds.length === 0}
                >
                  <IconX size={12} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          <ScrollArea.Autosize mah={300}>
            <Stack gap="xs">
              {availableDocuments.map(doc => (
                <Group key={doc.id} gap="sm" wrap="nowrap">
                  <Checkbox
                    checked={selectedDocIds.includes(doc.id)}
                    onChange={() => handleDocumentToggle(doc.id)}
                    size="sm"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" truncate title={doc.fileName}>
                      {doc.fileName}
                    </Text>
                    <Group gap="xs">
                      <Badge
                        size="xs"
                        variant="light"
                        color={
                          doc.status === DocumentStatus.READY
                            ? "green"
                            : doc.status === DocumentStatus.EMBEDDING
                              ? "orange"
                              : "blue"
                        }
                      >
                        {doc.status}
                      </Badge>
                      {doc.statusProgress !== undefined && doc.statusProgress < 1 && (
                        <Text size="xs" c="dimmed">
                          {Math.round(doc.statusProgress * 100)}%
                        </Text>
                      )}
                    </Group>
                  </div>
                </Group>
              ))}
            </Stack>
          </ScrollArea.Autosize>

          <Group justify="space-between" pt="sm" style={{ borderTop: "1px solid var(--mantine-color-gray-3)" }}>
            <Button size="xs" variant="light" onClick={handleSelectAll} disabled={isAllSelected}>
              Select All
            </Button>
            <Button
              size="xs"
              variant="light"
              color="gray"
              onClick={handleUnselectAll}
              disabled={selectedDocIds.length === 0}
            >
              Unselect All
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};
