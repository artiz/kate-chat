import React from "react";
import { Title, Paper, Stack, Table, Loader, Text, Group, Badge, Alert, ActionIcon, Tooltip } from "@mantine/core";
import { IconFile, IconRefresh, IconAlertCircle } from "@tabler/icons-react";
import { useQuery, useSubscription } from "@apollo/client";
import { gql } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { formatFileSize } from "@/lib";

const GET_DOCUMENTS = gql`
  query GetDocuments {
    documents {
      id
      fileName
      fileSize
      status
      createdAt
      downloadUrl
    }
  }
`;

const DOCUMENT_STATUS_SUBSCRIPTION = gql`
  subscription DocumentStatus($documentIds: [String!]!) {
    documentsStatus(documentIds: $documentIds) {
      id
      status
      statusProgress
      downloadUrl
    }
  }
`;

interface Document {
  id: string;
  fileName: string;
  fileSize: number;
  status: string;
  createdAt: string;
  downloadUrl?: string;
}

const getStatusColor = (status: string): string => {
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

  const documentIds = data?.documents.map((doc: Document) => doc.id) || [];

  const { data: subscriptionData } = useSubscription(DOCUMENT_STATUS_SUBSCRIPTION, {
    variables: { documentIds },
    skip: documentIds.length === 0,
  });

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
                {data?.documents.length || 0} documents
              </Text>
            </Group>
          </Group>

          {loading ? (
            <Group justify="center" p="xl">
              <Loader size="lg" />
            </Group>
          ) : data && data.documents.length > 0 ? (
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>File Name</Table.Th>
                  <Table.Th>Size</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Created At</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.documents.map((doc: Document) => (
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
                      <Text>{formatFileSize(doc.fileSize)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={getStatusColor(doc.status)} variant="light">
                        {doc.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{new Date(doc.createdAt).toLocaleDateString()}</Text>
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
