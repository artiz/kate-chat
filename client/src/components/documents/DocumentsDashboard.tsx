import React, { use, useMemo } from "react";
import { Title, Paper, Stack, Table, Loader, Text, Group, Badge, Alert, ActionIcon, Tooltip } from "@mantine/core";
import { IconFile, IconRefresh, IconAlertCircle } from "@tabler/icons-react";
import { useQuery, useSubscription } from "@apollo/client";
import { gql } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { formatFileSize } from "@/lib";
import { DOCUMENT_STATUS_SUBSCRIPTION, GET_DOCUMENTS, Document, DocumentStatusMessage } from "@/store/services/graphql";

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

  const { data: subscriptionData } = useSubscription<DocumentStatusMessage[]>(DOCUMENT_STATUS_SUBSCRIPTION, {
    variables: { documentIds },
    skip: documentIds.length === 0,
  });

  const documents = useMemo(() => {
    const statusMap = (subscriptionData || []).reduce(
      (acc, message: DocumentStatusMessage) => {
        acc[message.documentId] = message;
        return acc;
      },
      {} as Record<string, DocumentStatusMessage>
    );

    return (
      data?.documents ||
      [].map((doc: Document) => ({
        ...doc,
        ...(statusMap[doc.id] || {}),
      }))
    );
  }, [data, subscriptionData]);

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
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>File Name</Table.Th>
                  <Table.Th>Size</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Summary</Table.Th>
                  <Table.Th>Created At</Table.Th>
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
                      <Text>{doc.summary}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{doc.createdAt && new Date(doc.createdAt).toLocaleDateString()}</Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
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
