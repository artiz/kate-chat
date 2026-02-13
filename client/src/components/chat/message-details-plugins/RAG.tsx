import React, { Fragment } from "react";
import { Text, Box, Group } from "@mantine/core";
import { Message, Document } from "@/types/graphql";
import { IconClipboardData, IconFileSearch, IconReportSearch } from "@tabler/icons-react";
import i18n from "@/i18n";

/** RAG Details - Display semantic search documents and relevant chunks */
export const RAG =
  (documents: Document[] = []) =>
  (message: Message): React.ReactNode => {
    if (!message || !message.metadata) return null;

    const relevantsChunks = message.metadata.relevantsChunks || [];
    const documentIds = message.metadata.documentIds || [];

    const detailsNodes: React.ReactNode[] = [];
    if (documentIds.length && documents) {
      const docsMap = documents.reduce(
        (acc, doc) => {
          acc[doc.id] = doc;
          return acc;
        },
        {} as Record<string, Document>
      );

      const cmp = (
        <Fragment key="rag-documents">
          <Group justify="flex-start" align="center" gap="xs" className="message-details-header">
            {relevantsChunks.length ? (
              <IconReportSearch className="message-details-icon" size={16} />
            ) : (
              <IconFileSearch className="message-details-icon" size={16} />
            )}
            <Text fw={600} size="sm">
              {relevantsChunks.length ? i18n.t("messageDetails.ragSearchResults") : i18n.t("messageDetails.ragSearch")}
            </Text>
          </Group>

          <div className="message-details-content">
            <ol>
              {documentIds.map((docId, idx) => (
                <li key={idx}>
                  {docsMap[docId] ? (
                    docsMap[docId].downloadUrl ? (
                      <a href={docsMap[docId].downloadUrl} target="_blank" rel="noopener noreferrer">
                        {docsMap[docId].fileName}
                      </a>
                    ) : (
                      docsMap[docId].fileName
                    )
                  ) : (
                    docId
                  )}
                </li>
              ))}
            </ol>
          </div>
        </Fragment>
      );

      detailsNodes.push(cmp);
    }

    if (relevantsChunks.length) {
      const cmp = (
        <Fragment key="rag-chunks">
          <Group justify="flex-start" align="center" gap="xs" mt="lg" className="message-details-header">
            <IconClipboardData size={16} className="message-details-icon" />
            <Text fw={600} size="sm">
              {i18n.t("messageDetails.relatedChunks")}
            </Text>
          </Group>

          {relevantsChunks.map((chunk, idx) => (
            <div key={chunk.id || idx} className="message-details-content">
              <Text size="xs" c="dimmed">
                {chunk.documentName || chunk.id} ({i18n.t("messageDetails.page", { page: chunk.page })})
              </Text>
              <Text size="xs" c="dimmed">
                {i18n.t("messageDetails.relevance")} {chunk.relevance || i18n.t("chat.na")}
              </Text>
              <Box fz="12">
                <pre>{chunk.content}</pre>
              </Box>
            </div>
          ))}
        </Fragment>
      );

      detailsNodes.push(cmp);
    }

    return detailsNodes.length ? detailsNodes : null;
  };
