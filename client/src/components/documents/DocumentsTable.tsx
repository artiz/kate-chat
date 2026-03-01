import React from "react";
import { useTranslation } from "react-i18next";
import { Table, Text, Group, Badge, ActionIcon, Tooltip, Checkbox, Box } from "@mantine/core";
import {
  IconRotateClockwise,
  IconTrash,
  IconMessage2Plus,
  IconMessageMinus,
  IconFileStack,
  IconMarkdown,
  IconFileBarcode,
  IconFileUpload,
  IconCloudUpload,
  IconFileAlert,
  IconFileShredder,
  IconFileTextAi,
  IconFiles,
  IconFileAnalytics,
  IconFileBroken,
  IconFileAi,
} from "@tabler/icons-react";
import { formatFileSize } from "@katechat/ui";
import { DocumentStatus, getStatusColor } from "@/types/ai";
import { Document } from "@/types/graphql";
import { MOBILE_BREAKPOINT } from "@/lib/config";
import { useMediaQuery } from "@mantine/hooks";

interface DocumentsTableProps {
  documents: Document[];
  chatDocumentsMap?: Record<string, Document>;
  chatId?: string;
  onAddToChat: (doc: Document) => void;
  onRemoveFromChat: (doc: Document) => void;
  onSelectAll?: (docs: Document[]) => void;
  onUnselectAll?: (docs: Document[]) => void;
  onReindexDocument: (doc: Document) => void;
  onDeleteDocument: (doc: Document) => void;
  onViewSummary: (doc: Document) => void;
  disableActions?: boolean;
  selectorView?: boolean;
}

export const DocumentsTable: React.FC<DocumentsTableProps> = ({
  documents,
  chatDocumentsMap = {},
  onAddToChat,
  onRemoveFromChat,
  onSelectAll,
  onUnselectAll,
  onReindexDocument,
  onDeleteDocument,
  onViewSummary,
  disableActions = false,
  selectorView = false,
}) => {
  const { t } = useTranslation();
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  if (documents.length === 0) {
    return (
      <Text ta="center" c="dimmed" py="xl">
        {t("documents.noDocumentsFound")}
      </Text>
    );
  }

  function documentCanBeDeleted(doc: Document): boolean | undefined {
    if (!doc) return false;

    return (
      doc.status === DocumentStatus.READY ||
      doc.status === DocumentStatus.ERROR ||
      (doc.status === DocumentStatus.PARSING && (doc.statusProgress ?? 0) >= 1)
    );
  }

  function documentCanBeReindexed(doc: Document): boolean | undefined {
    return (
      doc &&
      (doc.status === DocumentStatus.READY ||
        (doc.status === DocumentStatus.CHUNKING && doc.statusProgress === 1) ||
        doc.status === DocumentStatus.EMBEDDING ||
        doc.status === DocumentStatus.SUMMARIZING ||
        doc.status === DocumentStatus.ERROR ||
        (doc.status === DocumentStatus.STORAGE_UPLOAD && doc.statusProgress === 1))
    );
  }

  const getStatusIcon = (status?: DocumentStatus): React.ReactNode => {
    const size = isMobile ? 16 : 20;
    switch (status) {
      case DocumentStatus.READY:
        return <IconFileTextAi size={size} />;
      case DocumentStatus.UPLOAD:
        return <IconFileUpload size={size} />;
      case DocumentStatus.STORAGE_UPLOAD:
        return <IconCloudUpload size={size} />;
      case DocumentStatus.BATCHING:
        return <IconFiles size={size} />;
      case DocumentStatus.PARSING:
        return <IconFileAnalytics size={size} />;
      case DocumentStatus.CHUNKING:
        return <IconFileStack size={size} />;
      case DocumentStatus.EMBEDDING:
        return <IconFileBarcode size={size} />;
      case DocumentStatus.SUMMARIZING:
        return <IconFileAi size={size} />;
      case DocumentStatus.ERROR:
        return <IconFileAlert size={size} />;
      case DocumentStatus.DELETING:
        return <IconFileShredder size={size} />;
      default:
        return <IconFileBroken size={size} />;
    }
  };

  const handleAddToChat = (doc: Document) => {
    return (evt: React.ChangeEvent<HTMLInputElement>) => {
      if (evt.target.checked) {
        onAddToChat(doc);
      } else {
        onRemoveFromChat(doc);
      }
    };
  };

  if (selectorView) {
    const eligibleDocs = documents.filter(
      doc => doc.status === DocumentStatus.READY || doc.status === DocumentStatus.SUMMARIZING
    );
    const eligibleSelectedCount = eligibleDocs.filter(doc => !!chatDocumentsMap[doc.id]).length;
    const allEligibleSelected = eligibleDocs.length > 0 && eligibleSelectedCount === eligibleDocs.length;
    const someEligibleSelected = eligibleSelectedCount > 0 && !allEligibleSelected;

    const handleSelectAllToggle = () => {
      if (allEligibleSelected) {
        if (onUnselectAll) {
          onUnselectAll(eligibleDocs);
        } else {
          eligibleDocs.filter(doc => !!chatDocumentsMap[doc.id]).forEach(doc => onRemoveFromChat(doc));
        }
      } else {
        if (onSelectAll) {
          onSelectAll(eligibleDocs);
        } else {
          eligibleDocs.filter(doc => !chatDocumentsMap[doc.id]).forEach(doc => onAddToChat(doc));
        }
      }
    };

    return (
      <>
        <Group align="center" justify="space-between" wrap="nowrap" gap="lg" mb="xs">
          <Checkbox
            checked={allEligibleSelected}
            indeterminate={someEligibleSelected}
            onChange={handleSelectAllToggle}
            size="sm"
            label={allEligibleSelected ? t("documents.unselectAll") : t("documents.selectAll")}
            disabled={eligibleDocs.length === 0}
          />
        </Group>
        {documents.map((doc: Document) => (
          <Group key={doc.id} align="center" justify="space-between" wrap="nowrap" gap="lg">
            <Group align="center" wrap="nowrap" gap="xs">
              <Checkbox
                checked={!!chatDocumentsMap[doc.id]}
                onChange={handleAddToChat(doc)}
                size="sm"
                disabled={doc.status !== DocumentStatus.READY && doc.status !== DocumentStatus.SUMMARIZING}
              />
              {doc.downloadUrlMarkdown && (
                <Tooltip label={doc.fileName + " Markdown"}>
                  <Box mt="sm">
                    <a href={doc.downloadUrlMarkdown} target="_blank" rel="noopener noreferrer">
                      <IconMarkdown size="1.2rem" />
                    </a>
                  </Box>
                </Tooltip>
              )}
              <Tooltip label={doc.fileName}>
                <Text truncate>{doc.fileName}</Text>
              </Tooltip>
            </Group>
            <Group align="center" wrap="nowrap">
              <Badge color={getStatusColor(doc.status)} leftSection={getStatusIcon(doc.status)}>
                {doc.status}
              </Badge>
              <ActionIcon.Group>
                <Tooltip label={t("documents.reindexDocument")}>
                  <ActionIcon
                    variant="light"
                    color="orange"
                    size="md"
                    onClick={() => onReindexDocument(doc)}
                    disabled={disableActions || !documentCanBeReindexed(doc)}
                  >
                    <IconRotateClockwise size="1.2rem" />
                  </ActionIcon>
                </Tooltip>

                <Tooltip label={t("documents.viewSummary")}>
                  <ActionIcon variant="light" color="blue" size="md" onClick={() => onViewSummary(doc)}>
                    <IconFileStack size="1.2rem" />
                  </ActionIcon>
                </Tooltip>
              </ActionIcon.Group>
            </Group>
          </Group>
        ))}
      </>
    );
  }

  return (
    <Table striped highlightOnHover horizontalSpacing="xs" style={{ tableLayout: "fixed", width: "100%" }}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th style={{ width: "45%" }}>{t("documents.fileName")}</Table.Th>
          <Table.Th visibleFrom="lg">{t("documents.size")}</Table.Th>
          <Table.Th>{t("common.status")}</Table.Th>
          <Table.Th>{t("common.actions")}</Table.Th>
          <Table.Th visibleFrom="lg">{t("documents.createdAt")}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {documents.map((doc: Document) => (
          <Table.Tr key={doc.id}>
            <Table.Td>
              <Group gap="xs" align="center" wrap="nowrap">
                {doc.downloadUrlMarkdown && (
                  <Tooltip label={doc.fileName + " Markdown"}>
                    <a href={doc.downloadUrlMarkdown} target="_blank" rel="noopener noreferrer">
                      <IconMarkdown />
                    </a>
                  </Tooltip>
                )}
                <Tooltip label={doc.fileName}>
                  <Text fw={500} truncate>
                    {doc.downloadUrl ? (
                      <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer">
                        {doc.fileName}
                      </a>
                    ) : (
                      doc.fileName
                    )}
                  </Text>
                </Tooltip>
              </Group>
            </Table.Td>
            <Table.Td visibleFrom="lg">
              <Text>{formatFileSize(doc.fileSize || 0)}</Text>
            </Table.Td>
            <Table.Td>
              <Badge color={getStatusColor(doc.status)} leftSection={getStatusIcon(doc.status)}>
                {isMobile ? null : (
                  <>
                    {doc.status}
                    {doc.status != DocumentStatus.ERROR ? `: ${((doc.statusProgress ?? 0) * 100).toFixed(2)}%` : ""}
                  </>
                )}
              </Badge>
            </Table.Td>

            <Table.Td>
              <ActionIcon.Group>
                <Tooltip label={t("documents.reindexDocument")}>
                  <ActionIcon
                    variant="light"
                    color="orange"
                    size="md"
                    onClick={() => onReindexDocument(doc)}
                    disabled={disableActions || !documentCanBeReindexed(doc)}
                  >
                    <IconRotateClockwise size="1.2rem" />
                  </ActionIcon>
                </Tooltip>

                <Tooltip label={t("documents.deleteDocument")}>
                  <ActionIcon
                    variant="light"
                    color="red"
                    size="md"
                    onClick={() => onDeleteDocument(doc)}
                    disabled={disableActions || !documentCanBeDeleted(doc)}
                  >
                    <IconTrash size="1.2rem" />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t("documents.viewSummary")}>
                  <ActionIcon variant="light" color="blue" size="md" onClick={() => onViewSummary(doc)}>
                    <IconFileStack size="1.2rem" />
                  </ActionIcon>
                </Tooltip>
              </ActionIcon.Group>
            </Table.Td>
            <Table.Td visibleFrom="lg">
              <Text size="sm">{doc.createdAt && new Date(doc.createdAt).toLocaleDateString()}</Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
};
