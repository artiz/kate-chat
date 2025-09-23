import React, { use, useCallback, useEffect, useMemo, useState } from "react";
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
  Box,
} from "@mantine/core";
import {
  IconFile,
  IconRefresh,
  IconAlertCircle,
  IconRotateClockwise,
  IconTrash,
  IconMessage2Plus,
  IconMessageMinus,
  IconFileCheckFilled,
  IconX,
} from "@tabler/icons-react";
import { useQuery, useSubscription, useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { formatFileSize } from "@/lib";
import { DeleteConfirmationModal } from "@/components/modal";
import { updateChat } from "@/store/slices/chatSlice";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  DOCUMENT_STATUS_SUBSCRIPTION,
  GET_DOCUMENTS,
  REINDEX_DOCUMENT_MUTATION,
  DELETE_DOCUMENT_MUTATION,
  ADD_TO_CHAT_MUTATION,
  GET_CHAT,
  GET_DOCUMENTS_FOR_CHAT,
  REMOVE_FROM_CHAT_MUTATION,
} from "@/store/services/graphql";
import { DocumentStatus, getStatusColor } from "@/types/ai";
import { parseMarkdown } from "@/lib/services/MarkdownParser";
import { Chat, ChatDocument, Document, DocumentStatusMessage } from "@/types/graphql";
import { ok } from "@/lib/assert";
import { set } from "lodash";
import { FileDropzone } from "../chat/ChatImageDropzone/ChatImageDropzone";
import { MAX_FILE_SIZE } from "@/lib/config";
import { useDocumentsUpload } from "@/hooks/useDocumentsUpload";
import { DocumentUploadProgress } from "../DocumentUploadProgress";
import { useNavigate } from "react-router-dom";

interface IProps {
  chatId?: string;
}

export const DocumentsDashboard: React.FC<IProps> = ({ chatId }) => {
  const [summaryDocument, setSummaryDocument] = useState<Document | undefined>(undefined);
  const [processedSummary, setProcessedSummary] = useState<string>("");
  const [documentToDelete, setDocumentToDelete] = useState<Document | undefined>(undefined);
  const [chat, setChat] = useState<Chat | undefined>(undefined);
  const { appConfig } = useAppSelector(state => state.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const { uploadDocuments, uploadingDocs, uploadLoading, uploadError } = useDocumentsUpload();

  const { loading, error, data, refetch } = useQuery<{ documents: Document[]; chatById: Chat | null | undefined }>(
    chatId ? GET_DOCUMENTS_FOR_CHAT : GET_DOCUMENTS,
    {
      errorPolicy: "all",
      onError: error => {
        notifications.show({
          title: "Error",
          message: error.message || "Failed to load documents",
          color: "red",
        });
      },
      variables: { chatId },
    }
  );

  const documentIds = useMemo(() => data?.documents.map((doc: Document) => doc.id) || [], [data?.documents]);

  useEffect(() => {
    setChat(data?.chatById || undefined);
  }, [data?.chatById]);

  const chatDocumentsMap = useMemo<Record<string, Document>>(() => {
    if (!chat?.chatDocuments) return {};

    return chat.chatDocuments.reduce(
      (acc, doc: ChatDocument) => {
        if (doc.document) {
          acc[doc.document.id] = doc.document;
        }
        return acc;
      },
      {} as Record<string, Document>
    );
  }, [chat]);

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

  const [deleteDocument, { loading: deleteLoading }] = useMutation(DELETE_DOCUMENT_MUTATION, {
    onCompleted: () => {
      notifications.show({
        title: "Document Deleted",
        message: "Document has been successfully deleted.",
        color: "green",
      });
      refetch();
    },
    onError: error => {
      notifications.show({
        title: "Delete Error",
        message: error.message || "Failed to delete document",
        color: "red",
      });
    },
  });

  const [addToChat, { loading: addingToChat }] = useMutation(ADD_TO_CHAT_MUTATION, {
    onCompleted: res => {
      const { chat, error } = res.addDocumentsToChat;

      if (error) {
        notifications.show({
          title: "Error Adding Document",
          message: error || "Failed to add document to chat",
          color: "red",
        });
      } else {
        notifications.show({
          title: "Document(s) Added",
          message: "Document(s) has been successfully added to chat.",
          color: "green",
        });
        dispatch(updateChat(chat));
        setChat(chat);
      }
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to add document to chat",
        color: "red",
      });
    },
  });

  const [removeFromChat, { loading: removingFromChat }] = useMutation(REMOVE_FROM_CHAT_MUTATION, {
    onCompleted: res => {
      const { chat, error } = res.removeDocumentsFromChat;

      if (error) {
        notifications.show({
          title: "Error Removing Document",
          message: error || "Failed to remove document from chat",
          color: "red",
        });
      } else {
        notifications.show({
          title: "Document(s) Removed",
          message: "Document(s) has been successfully removed from chat.",
          color: "green",
        });
        dispatch(updateChat(chat));
        setChat(chat);
      }
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to remove document from chat",
        color: "red",
      });
    },
  });

  const handleAddToChat = (doc: Document) => {
    ok(chatId);
    addToChat({ variables: { documentIds: [doc.id], chatId } });
  };

  const handleRemoveFromChat = (doc: Document) => {
    ok(chatId);
    removeFromChat({ variables: { documentIds: [doc.id], chatId } });
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleDeleteDocument = (doc: Document) => {
    setDocumentToDelete(doc);
  };

  const confirmDeleteDocument = () => {
    if (documentToDelete) {
      deleteDocument({ variables: { id: documentToDelete.id } });
      setDocumentToDelete(undefined);
    }
  };

  useEffect(() => {
    if (!summaryDocument?.summary) {
      setProcessedSummary("");
    } else {
      parseMarkdown(summaryDocument?.summary || "")
        .then(res => setProcessedSummary(res.join("\n")))
        .catch(err => {
          console.error("Error processing markdown", err);
          setProcessedSummary("Error processing summary: " + err.message);
        });
    }
  }, [summaryDocument?.summary]);

  const handleAddFiles = useCallback(
    (files: File[]) => {
      const filesToAdd = files.filter(f => f.size < MAX_FILE_SIZE);
      if (filesToAdd.length < files.length) {
        notifications.show({
          title: "Warning",
          message: `Some files are too large and were not added (max size: ${MAX_FILE_SIZE / 1024 / 1024} MB)`,
          color: "yellow",
        });
      }

      let imageFiles = filesToAdd.filter(f => f.type?.startsWith("image/"));
      const documents = filesToAdd.filter(f => !f.type?.startsWith("image/"));

      // Limit to MAX_IMAGES
      if (imageFiles.length) {
        notifications.show({
          title: "Warning",
          message: `You can upload only non-image files here`,
          color: "yellow",
        });
      }

      if (documents.length) {
        if (!appConfig?.ragEnabled) {
          return notifications.show({
            title: "Warning",
            message: "RAG is not enabled. Documents will not be processed.",
            color: "yellow",
          });
        }

        uploadDocuments(documents, chatId)
          .then(() => {
            refetch();
          })
          .catch(error => {
            notifications.show({
              title: "Error",
              message: error.message || "Failed to upload documents",
              color: "red",
            });
          });
      }
    },
    [chatId]
  );

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
        <Title order={1}>Documents {chat ? `for "${chat.title}"` : ""}</Title>
        <Group>
          {chatId ? (
            <Tooltip label="Back to chat">
              <ActionIcon onClick={() => navigate(`/chat/${chatId}`)}>
                <IconX size="1.2rem" />
              </ActionIcon>
            </Tooltip>
          ) : null}
          <Tooltip label="Refresh documents">
            <ActionIcon variant="light" color="blue" size="lg" onClick={handleRefresh} loading={loading}>
              <IconRefresh size="1.2rem" />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Paper withBorder p="lg">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={2}>Document Library</Title>
            <Group>
              <Text size="sm" c="dimmed">
                {documents.length} document(s)
              </Text>
              <FileDropzone onFilesAdd={handleAddFiles} disabled={!appConfig?.s3Connected} />
            </Group>
          </Group>
          <DocumentUploadProgress error={uploadError} loading={uploadLoading} documents={uploadingDocs || []} />

          {loading ? (
            <Group justify="center" p="xl">
              <Loader size="lg" />
            </Group>
          ) : data && documents.length > 0 ? (
            <>
              <DeleteConfirmationModal
                isOpen={!!documentToDelete}
                onClose={() => setDocumentToDelete(undefined)}
                onConfirm={confirmDeleteDocument}
                title="Delete Document"
                message={`Are you sure you want to delete "${documentToDelete?.fileName}"? This action cannot be undone and will remove the document and all its associated data.`}
                confirmLabel="Delete Document"
                isLoading={deleteLoading}
              />

              <Modal
                opened={!!summaryDocument}
                onClose={() => setSummaryDocument(undefined)}
                title="Document Summary"
                centered
                size="xl"
              >
                <Alert p="xs" mb="sm" title="Summarization Model" color="blue">
                  {summaryDocument?.summaryModelId}
                </Alert>
                <Alert p="xs" mb="sm" title="Embeddings Model" color="green">
                  {summaryDocument?.embeddingsModelId}
                </Alert>
                <Box size="sm" fz="12">
                  <div dangerouslySetInnerHTML={{ __html: processedSummary }} />
                </Box>

                <Group mt="md" justify="flex-end">
                  <Button onClick={() => setSummaryDocument(undefined)}>Close</Button>
                </Group>
              </Modal>

              <Table striped highlightOnHover withTableBorder style={{ tableLayout: "fixed", width: "100%" }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: "60%" }}>File Name</Table.Th>
                    <Table.Th style={{ width: "8rem" }}>Size</Table.Th>
                    <Table.Th style={{ width: "12rem" }}>Status</Table.Th>
                    <Table.Th style={{ width: "8rem" }}>Actions</Table.Th>
                    <Table.Th style={{ width: "20%" }}>Summary</Table.Th>
                    <Table.Th style={{ width: "20%" }}>Created At</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {documents.map((doc: Document) => (
                    <Table.Tr key={doc.id}>
                      <Table.Td>
                        <Group wrap="nowrap">
                          {chatDocumentsMap[doc.id] ? <IconFileCheckFilled size="1rem" /> : <IconFile size="1rem" />}

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
                          {doc.status}: {doc.statusProgress ? `${(doc.statusProgress * 100).toFixed(2)}%` : "--"}
                        </Badge>
                      </Table.Td>

                      <Table.Td>
                        <ActionIcon.Group>
                          {chatDocumentsMap[doc.id] ? (
                            <Tooltip label="Remove from chat">
                              <ActionIcon
                                variant="light"
                                color="red"
                                size="lg"
                                onClick={() => handleRemoveFromChat(doc)}
                                disabled={removingFromChat}
                              >
                                <IconMessageMinus size="1.2rem" />
                              </ActionIcon>
                            </Tooltip>
                          ) : chatId ? (
                            <Tooltip label="Add to chat">
                              <ActionIcon
                                variant="light"
                                color="blue"
                                size="lg"
                                onClick={() => handleAddToChat(doc)}
                                disabled={
                                  addingToChat ||
                                  (doc.status !== DocumentStatus.READY && doc.status !== DocumentStatus.SUMMARIZING)
                                }
                              >
                                <IconMessage2Plus size="1.2rem" />
                              </ActionIcon>
                            </Tooltip>
                          ) : null}

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

                          {(doc.status === DocumentStatus.READY || doc.status === DocumentStatus.ERROR) && (
                            <Tooltip label="Delete document">
                              <ActionIcon
                                variant="light"
                                color="red"
                                size="lg"
                                onClick={() => handleDeleteDocument(doc)}
                                disabled={deleteLoading}
                              >
                                <IconTrash size="1.2rem" />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </ActionIcon.Group>
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
