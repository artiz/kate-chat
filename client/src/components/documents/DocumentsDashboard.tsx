import React, { use, useMemo, useState } from "react";
import {
  Title,
  Paper,
  Stack,
  Table,
  Loader,
  Text,
  Group,
  Badge,
  Alert,
  ActionIcon,
  Tooltip,
  Modal,
  Button,
} from "@mantine/core";
import { IconFile, IconRefresh, IconAlertCircle, IconRotateClockwise } from "@tabler/icons-react";
import { useQuery, useSubscription, useMutation } from "@apollo/client";
import { gql } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { formatFileSize } from "@/lib";
import {
  DOCUMENT_STATUS_SUBSCRIPTION,
  GET_DOCUMENTS,
  Document,
  DocumentStatusMessage,
  REINDEX_DOCUMENT_MUTATION,
  DocumentStatus,
} from "@/store/services/graphql";

const getStatusColor = (status?: string): string => {
  switch (status?.toLowerCase()) {
    case "completed":
    case "processed":
      return "green";
    case "processing":
    case "uploading":
      return "blue";
    case "failed":
    case "error":
      return "red";
    case "pending":
    case "queued":
      return "yellow";
    default:
      return "gray";
  }
};

export const DocumentsDashboard: React.FC = () => {
  const { loading, error, data, refetch } = useQuery<{ documents: Document[] }>(GET_DOCUMENTS, {
    errorPolicy: "all",
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to load documents",
        color: "red",
      });
    },
  });

  const documentIds = useMemo(() => data?.documents.map((doc: Document) => doc.id) || [], [data?.documents]);

  const { data: subscriptionData } = useSubscription<{ documentsStatus: DocumentStatusMessage[] }>(
    DOCUMENT_STATUS_SUBSCRIPTION,
    {
      variables: { documentIds },
      skip: documentIds.length === 0,
    }
  );

  const documents = useMemo(() => {
    const statusMap = (subscriptionData?.documentsStatus || []).reduce(
      (acc, message: DocumentStatusMessage) => {
        acc[message.documentId] = message;
        return acc;
      },
      {} as Record<string, DocumentStatusMessage>
    );

    return (data?.documents || []).map((doc: Document) => ({
      ...doc,
      ...(statusMap[doc.id] || {}),
    }));
  }, [data, subscriptionData]);

  const [reindexDocument, { loading: reindexLoading }] = useMutation(REINDEX_DOCUMENT_MUTATION, {
    onCompleted: () => {
      notifications.show({
        title: "Reindex Requested",
        message: "Document reindexing has been triggered.",
        color: "green",
      });
      refetch();
    },
    onError: error => {
      notifications.show({
        title: "Reindex Error",
        message: error.message || "Failed to reindex document",
        color: "red",
      });
    },
  });

  const [summaryDocument, setSummaryDocument] = useState<Document | undefined>(undefined);

  const handleRefresh = () => {
    refetch();
  };

  if (error) {
    return (
      <Alert icon={<IconAlertCircle size="1rem" />} title="Error Loading Documents" color="red" variant="light">
        {error.message || "Failed to load documents. Please try again."}
      </Alert>
    );
  }

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="center">
        <Title order={1}>Documents</Title>
        <Tooltip label="Refresh documents">
          <ActionIcon variant="light" color="blue" size="lg" onClick={handleRefresh} loading={loading}>
            <IconRefresh size="1.2rem" />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Paper withBorder p="lg">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={2}>Document Library</Title>
            <Group>
              <IconFile size="1.2rem" />
              <Text size="sm" c="dimmed">
                {documents.length} document(s)
              </Text>
            </Group>
          </Group>

          {loading ? (
            <Group justify="center" p="xl">
              <Loader size="lg" />
            </Group>
          ) : data && documents.length > 0 ? (
            <>
              <Modal
                opened={!!summaryDocument}
                onClose={() => setSummaryDocument(undefined)}
                title="Document Summary"
                centered
              >
                <Alert p="xs" mb="sm" title="Summarization Model" color="blue">
                  {summaryDocument?.summaryModelId}
                </Alert>
                <Alert p="xs" mb="sm" title="Embeddings Model" color="green">
                  {summaryDocument?.embeddingsModelId}
                </Alert>
                <Text>{summaryDocument?.summary}</Text>
                <Group mt="md" justify="flex-end">
                  <Button onClick={() => setSummaryDocument(undefined)}>Close</Button>
                </Group>
              </Modal>

              <Table striped highlightOnHover withTableBorder style={{ tableLayout: "fixed", width: "100%" }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: "22%" }}>File Name</Table.Th>
                    <Table.Th style={{ width: "10%" }}>Size</Table.Th>
                    <Table.Th style={{ width: "13%" }}>Status</Table.Th>
                    <Table.Th style={{ width: "12%" }}>Actions</Table.Th>
                    <Table.Th style={{ width: "28%" }}>Summary</Table.Th>
                    <Table.Th style={{ width: "15%" }}>Created At</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {documents.map((doc: Document) => (
                    <Table.Tr key={doc.id}>
                      <Table.Td>
                        <Group>
                          <IconFile size="1rem" />
                          <Text fw={500}>
                            {doc.downloadUrl ? (
                              <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer">
                                {doc.fileName}
                              </a>
                            ) : (
                              doc.fileName
                            )}
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text>{formatFileSize(doc.fileSize || 0)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={getStatusColor(doc.status)} variant="light">
                          {doc.status}: {doc.statusProgress ? `${doc.statusProgress * 100}%` : "--"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {(doc.status === DocumentStatus.READY ||
                          doc.status === DocumentStatus.SUMMARIZING ||
                          doc.status === DocumentStatus.ERROR ||
                          (doc.status === DocumentStatus.STORAGE_UPLOAD && doc.statusProgress === 1)) && (
                          <Tooltip label="Reindex document">
                            <ActionIcon
                              variant="light"
                              color="orange"
                              size="lg"
                              onClick={() => reindexDocument({ variables: { id: doc.id } })}
                              loading={reindexLoading}
                            >
                              <IconRotateClockwise size="1.2rem" />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {doc.summary ? (
                          <Button variant="light" size="xs" onClick={() => setSummaryDocument(doc)}>
                            View
                          </Button>
                        ) : (
                          <Text>{doc.statusInfo}</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{doc.createdAt && new Date(doc.createdAt).toLocaleDateString()}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </>
          ) : (
            <Text ta="center" c="dimmed" py="xl">
              No documents found
            </Text>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
};
