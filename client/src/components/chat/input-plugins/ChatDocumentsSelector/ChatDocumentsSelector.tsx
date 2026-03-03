import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  Badge,
  Box,
  Menu,
  Indicator,
} from "@mantine/core";
import { IconCheck, IconX, IconFileDatabase } from "@tabler/icons-react";
import { Document } from "@/types/graphql";

import { DocumentStatus, getStatusColor } from "@/types/ai";
import classes from "./ChatDocumentsSelector.module.scss";

interface ChatDocumentsSelectorProps {
  selectedDocIds?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  disabled?: boolean;
  documents: Document[];
  openDocuments: () => void;
}

export const ChatDocumentsSelector: React.FC<ChatDocumentsSelectorProps> = ({
  selectedDocIds = [],
  onSelectionChange,
  documents = [],
  disabled = false,
  openDocuments,
}) => {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);

  // Filter documents that are ready for RAG search
  const availableDocuments = useMemo(() => {
    return documents.filter(doc => doc.status === DocumentStatus.READY || doc.status === DocumentStatus.SUMMARIZING);
  }, [documents]);

  const availableDocumentsIds = useMemo(() => {
    return new Set(availableDocuments.map(doc => doc.id));
  }, [availableDocuments]);

  const selectedDocuments = useMemo(() => {
    return availableDocuments.filter(doc => selectedDocIds.includes(doc.id));
  }, [availableDocuments, selectedDocIds]);

  const handleDocumentToggle = (docId: string) => () => {
    if (!availableDocumentsIds.has(docId)) return;

    const newSelection = selectedDocIds.includes(docId)
      ? selectedDocIds.filter(id => id !== docId)
      : [...selectedDocIds, docId];
    onSelectionChange?.(newSelection);
  };

  const handleSelectAll = () => {
    onSelectionChange?.([...availableDocumentsIds]);
    setOpened(false);
  };

  const handleUnselectAll = () => {
    onSelectionChange?.([]);
    setOpened(false);
  };

  const handleToggle = () => {
    setOpened(!opened);
  };

  const handleOpenDocuments = () => {
    setOpened(false);
    openDocuments();
  };

  const isAllSelected = availableDocuments.length > 0 && selectedDocIds.length === availableDocuments.length;

  return (
    <>
      <Menu shadow="md" withArrow opened={opened} trapFocus={false} onClose={() => setOpened(false)}>
        <Menu.Target>
          <Group justify="start" className="drop-zone-control" gap="xs">
            <Tooltip label={t("documents.attachDocuments")} position="bottom">
              <Indicator inline label={selectedDocuments.length} disabled={!selectedDocuments.length} size={16}>
                <ActionIcon variant="default" size="lg" className={classes.button} onClick={handleToggle}>
                  <IconFileDatabase size="24" />
                </ActionIcon>
              </Indicator>
            </Tooltip>
            <Box hiddenFrom="xs" pe="sm" className="pointer" onClick={handleToggle}>
              {t("documents.selectDocuments")}
            </Box>
          </Group>
        </Menu.Target>

        <Menu.Dropdown>
          <Stack gap="sm" p="sm">
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                {t("documents.ragDocuments", { selected: selectedDocuments.length, total: availableDocuments.length })}
              </Text>
              <Group gap="xs">
                <Tooltip label={t("documents.selectAll")}>
                  <ActionIcon
                    size="sm"
                    variant="light"
                    color="blue"
                    onClick={handleSelectAll}
                    disabled={disabled || isAllSelected || availableDocuments.length === 0}
                  >
                    <IconCheck size={12} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t("documents.unselectAll")}>
                  <ActionIcon
                    size="sm"
                    variant="light"
                    color="gray"
                    onClick={handleUnselectAll}
                    disabled={disabled || selectedDocIds.length === 0 || availableDocuments.length === 0}
                  >
                    <IconX size={12} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>

            <ScrollArea.Autosize mah={300} maw="90vw">
              <Stack gap="xs" className="fixed-width-truncate">
                {availableDocuments.map(doc => (
                  <Group
                    key={doc.id}
                    gap="sm"
                    wrap="nowrap"
                    onMouseDown={e => e.stopPropagation()}
                    onTouchStart={e => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedDocIds.includes(doc.id)}
                      onChange={handleDocumentToggle(doc.id)}
                      size="sm"
                      disabled={disabled || !availableDocumentsIds.has(doc.id)}
                    />
                    <div className="fixed-width-truncate">
                      <Text size="sm" truncate title={doc.fileName}>
                        {doc.downloadUrl ? (
                          <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer">
                            {doc.fileName}
                          </a>
                        ) : (
                          doc.fileName
                        )}
                      </Text>
                      <Group gap="xs">
                        <Badge size="xs" variant="light" color={getStatusColor(doc.status)}>
                          {doc.status}
                        </Badge>
                        {doc.statusProgress !== undefined && (
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

            <Group justify="space-between" pt="sm">
              <Button size="xs" variant="light" onClick={handleOpenDocuments}>
                {t("documents.documentsButton")}
              </Button>
            </Group>
          </Stack>
        </Menu.Dropdown>
      </Menu>
    </>
  );
};
