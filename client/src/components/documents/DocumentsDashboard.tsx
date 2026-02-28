import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Title,
  Paper,
  Stack,
  Loader,
  Text,
  Group,
  Alert,
  ActionIcon,
  Tooltip,
  Modal,
  Button,
  Box,
  Pagination,
  TextInput,
  Badge,
  ScrollArea,
} from "@mantine/core";
import { IconRefresh, IconAlertCircle, IconX, IconSearch } from "@tabler/icons-react";
import { useQuery, useSubscription, useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { assert, parseMarkdown, DeleteConfirmationModal, FileDropzone, DropFilesOverlay } from "@katechat/ui";

import { updateChat } from "@/store/slices/chatSlice";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  DOCUMENT_STATUS_SUBSCRIPTION,
  GET_DOCUMENTS,
  REINDEX_DOCUMENT_MUTATION,
  DELETE_DOCUMENT_MUTATION,
  ADD_TO_CHAT_MUTATION,
  GET_DOCUMENTS_FOR_CHAT,
  REMOVE_FROM_CHAT_MUTATION,
} from "@/store/services/graphql.queries";
import { Chat, ChatDocument, Document, DocumentStatusMessage, GetDocumentsForChatResponse } from "@/types/graphql";
import { MAX_UPLOAD_FILE_SIZE, MOBILE_BREAKPOINT, SUPPORTED_UPLOAD_FORMATS } from "@/lib/config";
import { useDocumentsUpload } from "@/hooks/useDocumentsUpload";
import { DocumentsTable } from "./DocumentsTable";
import { getStatusColor } from "@/types/ai";
import { useMediaQuery } from "@mantine/hooks";
import { set } from "lodash";

interface IProps {
  chatId?: string;
  selectorView?: boolean;
}

const DEBOUNCE_DELAY_MS = 250;

export const DocumentsDashboard: React.FC<IProps> = ({ chatId, selectorView = false }) => {
  const [summaryDocument, setSummaryDocument] = useState<Document | undefined>(undefined);
  const [processedSummary, setProcessedSummary] = useState<string>("");
  const [documentToDelete, setDocumentToDelete] = useState<Document | undefined>(undefined);
  const [documentToReindex, setDocumentToReindex] = useState<Document | undefined>(undefined);
  const [chatDocumentsMap, setChatDocumentsMap] = useState<Record<string, Document>>({});
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [chat, setChat] = useState<Chat | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const { appConfig } = useAppSelector(state => state.user);
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const itemsPerPage = 10;
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);

  const { uploadDocuments, uploadingDocs, uploadLoading, stopUpload } = useDocumentsUpload();

  const { loading, error, data, refetch } = useQuery<GetDocumentsForChatResponse>(
    chatId ? GET_DOCUMENTS_FOR_CHAT : GET_DOCUMENTS,
    {
      errorPolicy: "all",
      onError: error => {
        notifications.show({
          title: t("common.error"),
          message: error.message || t("documents.failedToLoadDocuments"),
          color: "red",
        });
      },
      variables: {
        chatId,
        input: {
          offset: (currentPage - 1) * itemsPerPage,
          limit: itemsPerPage,
          searchTerm: searchTerm || undefined,
        },
      },
    }
  );

  useEffect(() => {
    if (chatId && data?.chatById) {
      setChat(data.chatById || undefined);
    }
  }, [data, chatId]);

  const monitoredDocumentIds = useMemo(
    () => [
      ...new Set(
        (data?.getDocuments?.documents?.map((d: Document) => d.id) || [])
          .concat(uploadingDocs.map((d: Document) => d.id))
          .filter(assert.notEmpty)
      ),
    ],
    [data?.getDocuments?.documents, uploadingDocs]
  );

  const { data: subscriptionData } = useSubscription<{ documentsStatus: DocumentStatusMessage[] }>(
    DOCUMENT_STATUS_SUBSCRIPTION,
    {
      variables: { documentIds: monitoredDocumentIds },
      skip: monitoredDocumentIds.length === 0,
    }
  );

  const statusUpdateTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const statusUpdateTimeoutTs = React.useRef<number | null>(null);

  useEffect(() => {
    const statusMap = (subscriptionData?.documentsStatus || []).reduce(
      (acc, message: DocumentStatusMessage) => {
        acc[message.documentId] = message;
        return acc;
      },
      {} as Record<string, DocumentStatusMessage>
    );

    const docs = (data?.getDocuments?.documents || []).map((doc: Document) => ({
      ...doc,
      ...statusMap[doc.id],
    }));

    const updateDocs = () => {
      setDocuments(prev => {
        if (!prev.length) {
          return docs;
        }
        const prevMap = prev.reduce(
          (acc, doc) => {
            acc[doc.id] = doc;
            return acc;
          },
          {} as Record<string, Document>
        );
        return docs.map(d => ((prevMap[d.id]?.updatedAt ?? 0) > (d.updatedAt ?? 0) ? prevMap[d.id] : d));
      });
    };

    if (statusUpdateTimeoutTs.current && Date.now() - statusUpdateTimeoutTs.current > DEBOUNCE_DELAY_MS) {
      updateDocs();
    }

    statusUpdateTimeoutTs.current = Date.now();
    statusUpdateTimeoutRef.current && clearTimeout(statusUpdateTimeoutRef.current);
    statusUpdateTimeoutRef.current = setTimeout(updateDocs, DEBOUNCE_DELAY_MS);
  }, [data?.getDocuments?.documents, subscriptionData]);

  const [reindexDocument, { loading: reindexLoading }] = useMutation(REINDEX_DOCUMENT_MUTATION, {
    onCompleted: () => {
      refetch();
    },
    onError: error => {
      notifications.show({
        title: t("documents.reindexError"),
        message: error.message || t("documents.failedToReindex"),
        color: "red",
      });
    },
  });

  const [deleteDocument, { loading: deleteLoading }] = useMutation(DELETE_DOCUMENT_MUTATION, {
    onCompleted: () => {
      refetch();
    },
    onError: error => {
      notifications.show({
        title: t("documents.deleteError"),
        message: error.message || t("documents.failedToDeleteDocument"),
        color: "red",
      });
    },
  });

  const [addToChat, { loading: addingToChat }] = useMutation(ADD_TO_CHAT_MUTATION, {
    onCompleted: res => {
      const { chat, error } = res.addDocumentsToChat;

      if (error) {
        notifications.show({
          title: t("documents.errorAddingDocument"),
          message: error || t("documents.failedToAddToChat"),
          color: "red",
        });
      } else {
        dispatch(updateChat(chat));
        setChat(chat);
      }
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("documents.failedToAddToChat"),
        color: "red",
      });
    },
  });

  const [removeFromChat, { loading: removingFromChat }] = useMutation(REMOVE_FROM_CHAT_MUTATION, {
    onCompleted: res => {
      const { chat, error } = res.removeDocumentsFromChat;

      if (error) {
        notifications.show({
          title: t("documents.errorRemovingDocument"),
          message: error || t("documents.failedToRemoveFromChat"),
          color: "red",
        });
      } else {
        dispatch(updateChat(chat));
        setChat(chat);
      }
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("documents.failedToRemoveFromChat"),
        color: "red",
      });
    },
  });

  const handleAddToChat = (doc: Document) => {
    assert.ok(chatId);
    setChatDocumentsMap(prev => ({ ...prev, [doc.id]: doc }));
    addToChat({ variables: { documentIds: [doc.id], chatId } });
  };

  const handleRemoveFromChat = (doc: Document) => {
    assert.ok(chatId);
    setChatDocumentsMap(prev => {
      const newMap = { ...prev };
      delete newMap[doc.id];
      return newMap;
    });
    removeFromChat({ variables: { documentIds: [doc.id], chatId } });
  };

  useEffect(() => {
    if (!chat?.chatDocuments) return;

    const map = chat.chatDocuments.reduce(
      (acc, doc: ChatDocument) => {
        if (doc.document) {
          acc[doc.document.id] = doc.document;
        }
        return acc;
      },
      {} as Record<string, Document>
    );
    setChatDocumentsMap(map);
  }, [chat]);

  const handleRefresh = () => {
    refetch();
  };

  const handleDeleteDocument = (doc: Document) => {
    setDocumentToDelete(doc);
  };

  const handleReindexDocument = (doc: Document) => {
    setDocumentToReindex(doc);
  };

  const handleSearch = () => {
    setSearchTerm(searchInput);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const confirmDeleteDocument = () => {
    if (documentToDelete) {
      deleteDocument({ variables: { id: documentToDelete.id } });
      stopUpload(documentToDelete.id);
      setDocumentToDelete(undefined);
    }
  };

  const confirmReindexDocument = () => {
    if (documentToReindex) {
      reindexDocument({ variables: { id: documentToReindex.id } });
      setDocumentToReindex(undefined);
    }
  };

  useEffect(() => {
    if (!summaryDocument?.summary) {
      setProcessedSummary("");
    } else {
      try {
        const summary = parseMarkdown(summaryDocument?.summary || "");
        setProcessedSummary(summary.join("\n"));
      } catch (err: unknown) {
        console.error("Error processing markdown", err);
        setProcessedSummary("Error processing summary: " + (err instanceof Error ? err.message : String(err)));
      }
    }
  }, [summaryDocument?.summary]);

  const handleAddFiles = useCallback(
    (files: File[]) => {
      setIsDragging(false);
      if (!files.length) return;

      const filesToAdd = files.filter(f => f.size < MAX_UPLOAD_FILE_SIZE);
      if (filesToAdd.length < files.length) {
        notifications.show({
          title: t("common.warning"),
          message: t("documents.filesTooLarge", { maxSize: MAX_UPLOAD_FILE_SIZE / 1024 / 1024 }),
          color: "yellow",
        });
      }

      let imageFiles = filesToAdd.filter(f => f.type?.startsWith("image/"));
      const documents = filesToAdd.filter(f => !f.type?.startsWith("image/"));

      // Limit to MAX_IMAGES
      if (imageFiles.length) {
        notifications.show({
          title: t("common.warning"),
          message: t("documents.nonImageFilesOnly"),
          color: "yellow",
        });
      }

      if (documents.length) {
        if (!appConfig?.ragEnabled) {
          return notifications.show({
            title: t("common.warning"),
            message: t("chat.ragNotEnabled"),
            color: "yellow",
          });
        }

        uploadDocuments(documents, chatId)
          .then(() => {
            refetch();
          })
          .catch(error => {
            notifications.show({
              title: t("common.error"),
              message: error.message || t("chat.failedToUploadDocs"),
              color: "red",
            });
          });
      }
    },
    [chatId, appConfig, uploadDocuments, refetch]
  );

  const handleDragOver = (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    if (ev.dataTransfer.types?.includes("Files")) {
      ev.dataTransfer.dropEffect = "copy";
      setIsDragging(true);
    }
  };
  const handleDragLeave = (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    if (ev.target === ev.currentTarget) {
      setIsDragging(false);
    }
  };

  const handleDrop = (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    const files =
      ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length > 0
        ? Array.from(ev.dataTransfer.files).filter(f => f.size > 0)
        : [];
    if (files.length) {
      handleAddFiles(files);
    }
  };

  // Calculate pagination
  const documentsResponse = data?.getDocuments;
  const totalDocuments = documentsResponse?.total || 0;
  const totalPages = Math.ceil(totalDocuments / itemsPerPage);

  if (error) {
    return (
      <Alert
        icon={<IconAlertCircle size="1rem" />}
        title={t("documents.errorLoadingDocuments")}
        color="red"
        variant="light"
      >
        {error.message || t("documents.failedToLoadRetry")}
      </Alert>
    );
  }

  return (
    <>
      <DropFilesOverlay
        visible={isDragging}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />
      <Stack gap="xl">
        <Group justify="space-between" align="center">
          {!selectorView && (
            <Title order={2} mb="lg">
              {t("documents.title")}
            </Title>
          )}
        </Group>

        <Paper withBorder p="lg" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Group>
                {uploadLoading && <Loader size="sm" />}

                <TextInput
                  placeholder={t("documents.searchDocuments")}
                  value={searchInput}
                  onChange={e => setSearchInput(e.currentTarget.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  rightSection={
                    <ActionIcon variant="light" onClick={handleSearch} loading={loading}>
                      <IconSearch size="1rem" />
                    </ActionIcon>
                  }
                />
                <FileDropzone
                  onFilesAdd={handleAddFiles}
                  disabled={!appConfig?.s3Connected || uploadLoading}
                  uploadFormats={SUPPORTED_UPLOAD_FORMATS}
                />

                <Tooltip label={t("documents.refreshDocuments")}>
                  <ActionIcon variant="light" color="blue" size="lg" onClick={handleRefresh} loading={loading}>
                    <IconRefresh size="1.2rem" />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>

            {loading ? (
              <Group justify="center" p="xl">
                <Loader size="lg" />
              </Group>
            ) : documentsResponse && totalDocuments > 0 ? (
              <>
                <DeleteConfirmationModal
                  isOpen={!!documentToDelete}
                  onClose={() => setDocumentToDelete(undefined)}
                  onConfirm={confirmDeleteDocument}
                  title={t("documents.deleteDocument")}
                  message={t("documents.deleteDocumentMessage", { fileName: documentToDelete?.fileName })}
                  confirmLabel={t("documents.deleteDocument")}
                  isLoading={deleteLoading}
                />

                <DeleteConfirmationModal
                  isOpen={!!documentToReindex}
                  onClose={() => setDocumentToReindex(undefined)}
                  onConfirm={confirmReindexDocument}
                  title={t("documents.reindexDocument")}
                  message={t("documents.reindexDocumentMessage", { fileName: documentToReindex?.fileName })}
                  confirmLabel={t("documents.reindexDocument")}
                  isLoading={reindexLoading}
                />

                <Modal
                  opened={!!summaryDocument}
                  onClose={() => setSummaryDocument(undefined)}
                  title={summaryDocument?.fileName || t("documents.documentInfo")}
                  centered
                  size="xl"
                  padding="lg"
                  fullScreen={isMobile}
                >
                  <Stack gap="sm">
                    <Group>
                      <Badge color={getStatusColor(summaryDocument?.status)} p="sm">
                        {summaryDocument?.status}
                      </Badge>
                      <Box size="sm" fz="12">
                        {summaryDocument?.statusInfo}
                      </Box>
                    </Group>

                    <ScrollArea.Autosize mah={"40vh"}>
                      <Box size="sm" fz="12">
                        <div dangerouslySetInnerHTML={{ __html: processedSummary }} />
                      </Box>
                    </ScrollArea.Autosize>
                    <Group w="100%" my="md" align="stretch">
                      {summaryDocument?.summaryModelId && (
                        <Alert p="md" title={t("documents.summarizationModel")} color="blue">
                          {summaryDocument.summaryModelId}
                        </Alert>
                      )}
                      {summaryDocument?.embeddingsModelId && (
                        <Alert p="md" title={t("documents.embeddingsModel")} color="indigo">
                          {summaryDocument?.embeddingsModelId}
                        </Alert>
                      )}

                      <Alert p="md" title={t("documents.processingAlert")} color="green">
                        <Stack gap="xs">
                          <Group gap="lg" align="center" justify="space-between">
                            <Text fz="12">{t("documents.pages")}</Text>
                            <Text>
                              {summaryDocument?.statusProgress && (summaryDocument?.pagesCount || 1) > 1
                                ? `${Math.round(summaryDocument.statusProgress * (summaryDocument?.pagesCount || 1))} / `
                                : ""}
                              {summaryDocument?.pagesCount || 1}
                            </Text>
                          </Group>
                          {summaryDocument?.metadata?.batchingPagePerSecond && (
                            <Group gap="lg" align="center" justify="space-between">
                              <Text fz="12">{t("documents.batchingPagesPerSec")}</Text>
                              <Text>{summaryDocument.metadata.batchingPagePerSecond.toFixed(2)}</Text>
                            </Group>
                          )}
                          {summaryDocument?.metadata?.parsingPagePerSecond && (
                            <Group gap="lg" align="center" justify="space-between">
                              <Text fz="12">{t("documents.parsingPagesPerSec")}</Text>
                              <Text>{summaryDocument.metadata.parsingPagePerSecond.toFixed(2)}</Text>
                            </Group>
                          )}
                          {summaryDocument?.metadata?.chunkingPagePerSecond && (
                            <Group gap="lg" align="center" justify="space-between">
                              <Text fz="12">{t("documents.chunkingPagesPerSec")}</Text>
                              <Text>{summaryDocument.metadata.chunkingPagePerSecond.toFixed(2)}</Text>
                            </Group>
                          )}
                          {summaryDocument?.metadata?.embeddingPagePerSecond && (
                            <Group gap="lg" align="center" justify="space-between">
                              <Text fz="12">{t("documents.embeddingPagesPerSec")}</Text>
                              <Text>{summaryDocument.metadata.embeddingPagePerSecond.toFixed(2)}</Text>
                            </Group>
                          )}
                        </Stack>
                      </Alert>
                    </Group>

                    <Group mt="md" justify="flex-end">
                      <Button onClick={() => setSummaryDocument(undefined)}>{t("common.close")}</Button>
                    </Group>
                  </Stack>
                </Modal>

                <DocumentsTable
                  documents={documents}
                  chatDocumentsMap={chatDocumentsMap}
                  chatId={chatId}
                  onAddToChat={handleAddToChat}
                  onRemoveFromChat={handleRemoveFromChat}
                  onReindexDocument={handleReindexDocument}
                  onDeleteDocument={handleDeleteDocument}
                  onViewSummary={setSummaryDocument}
                  disableActions={addingToChat || removingFromChat || reindexLoading || deleteLoading}
                  selectorView={selectorView}
                />

                {totalPages > 1 && (
                  <Group justify="center" mt="md">
                    <Pagination value={currentPage} onChange={handlePageChange} total={totalPages} size="sm" />
                  </Group>
                )}

                <Text size="sm" c="dimmed" ta="center">
                  {t("documents.showingOf", { count: documents.length, total: totalDocuments })}
                </Text>
              </>
            ) : null}
          </Stack>
        </Paper>
      </Stack>
    </>
  );
};
