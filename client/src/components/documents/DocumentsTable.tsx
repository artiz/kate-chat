import React from "react";
import { Table, Text, Group, Badge, ActionIcon, Tooltip, Button, Box } from "@mantine/core";
import {
  IconFile,
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
  onReindexDocument: (doc: Document) => void;
  onDeleteDocument: (doc: Document) => void;
  onViewSummary: (doc: Document) => void;
  disableActions: boolean;
}

export const DocumentsTable: React.FC<DocumentsTableProps> = ({
  documents,
  chatDocumentsMap = {},
  chatId,
  onAddToChat,
  onRemoveFromChat,
  onReindexDocument,
  onDeleteDocument,
  onViewSummary,
  disableActions = false,
}) => {
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  if (documents.length === 0) {
    return (
      <Text ta="center" c="dimmed" py="xl">
        No documents found
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

  return (
    <Table striped highlightOnHover horizontalSpacing="xs" style={{ tableLayout: "fixed", width: "100%" }}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th style={{ width: "45%" }}>File Name</Table.Th>
          <Table.Th visibleFrom="lg">Size</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th>Actions</Table.Th>
          <Table.Th visibleFrom="lg">Created At</Table.Th>
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
                {chatDocumentsMap[doc.id] ? (
                  <Tooltip label="Remove from chat">
                    <ActionIcon
                      variant="light"
                      color="red"
                      size="md"
                      onClick={() => onRemoveFromChat(doc)}
                      disabled={disableActions}
                    >
                      <IconMessageMinus size="1.2rem" />
                    </ActionIcon>
                  </Tooltip>
                ) : chatId ? (
                  <Tooltip label="Add to chat">
                    <ActionIcon
                      variant="light"
                      color="blue"
                      size="md"
                      onClick={() => onAddToChat(doc)}
                      disabled={
                        disableActions ||
                        (doc.status !== DocumentStatus.READY && doc.status !== DocumentStatus.SUMMARIZING)
                      }
                    >
                      <IconMessage2Plus size="1.2rem" />
                    </ActionIcon>
                  </Tooltip>
                ) : null}

                <Tooltip label="Reindex document">
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

                <Tooltip label="Delete document">
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

                <Tooltip label="View summary">
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
