import React, { Fragment } from "react";
import { Text, Box, Group } from "@mantine/core";
import { Message, Document, RagResponse } from "@/types/graphql";
import { IconAnalyze, IconClipboardData, IconFileSearch, IconReportSearch } from "@tabler/icons-react";
import { TFunction, t as globalT } from "i18next";

/** RAG Details - Display semantic search documents and relevant chunks */
export const RAG =
  (documents: Document[] = [], t: TFunction = globalT) =>
  (message: Message): React.ReactNode => {
    if (!message || !message.metadata) return null;

    const relevantsChunks = message.metadata.relevantsChunks || [];
    const documentIds = message.metadata.documentIds || [];
    const ragResponse = message.metadata.ragResponse || {};

    const detailsNodes: React.ReactNode[] = [];
    if (documentIds.length && documents) {
      const docsMap = documents.reduce(
        (acc, doc) => {
          acc[doc.id] = doc;
          return acc;
        },
        {} as Record<string, Document>
      );

      if (relevantsChunks.length) {
        for (const chunk of relevantsChunks) {
          if (!docsMap[chunk.documentId]) {
            docsMap[chunk.documentId] = {
              id: chunk.documentId,
              fileName: chunk.documentName,
            };
          }
        }
      }

      const cmp = (
        <Fragment key="rag-documents">
          <Group justify="flex-start" align="center" gap="xs" className="message-details-header">
            {relevantsChunks.length ? (
              <IconReportSearch className="message-details-icon" size={16} />
            ) : (
              <IconFileSearch className="message-details-icon" size={16} />
            )}
            <Text fw={600} size="sm">
              {relevantsChunks.length ? t("messageDetails.ragSearchResults") : t("messageDetails.ragSearch")}
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
              {t("messageDetails.relatedChunks")}
            </Text>
          </Group>

          {relevantsChunks.map((chunk, idx) => (
            <div key={chunk.id || idx} className="message-details-content">
              <Text size="xs" c="dimmed">
                {chunk.documentName || chunk.id} ({t("messageDetails.page", { page: chunk.page })})
              </Text>
              <Text size="xs" c="dimmed">
                {t("messageDetails.relevance")} {chunk.relevance || t("chat.na")}
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

    if (ragResponse.step_by_step_analysis || ragResponse.reasoning_summary) {
      const cmp = (
        <Fragment key="rag-analysis">
          <Group justify="flex-start" align="center" gap="xs" mt="lg" className="message-details-header">
            <IconAnalyze size={16} className="message-details-icon" />
            <Text fw={600} size="sm">
              {t("messageDetails.ragAnalysis")}
            </Text>
          </Group>

          {ragResponse.step_by_step_analysis && (
            <div className="message-details-content">
              <Text size="xs" c="dimmed">
                {t("messageDetails.ragStepByStepAnalysis")}
              </Text>
              <Box fz="12">
                {ragResponse.step_by_step_analysis.split("\n").map((line, idx) => (
                  <p key={idx} style={{ margin: 0 }}>
                    {line}
                  </p>
                ))}
              </Box>
            </div>
          )}

          {ragResponse.reasoning_summary && (
            <div className="message-details-content">
              <Text size="xs" c="dimmed">
                {t("messageDetails.ragReasoningSummary")}
              </Text>
              <Box fz="12">
                {ragResponse.reasoning_summary.split("\n").map((line, idx) => (
                  <p key={idx} style={{ margin: 0 }}>
                    {line}
                  </p>
                ))}
              </Box>
            </div>
          )}
        </Fragment>
      );

      detailsNodes.push(cmp);
    }

    return detailsNodes.length ? detailsNodes : null;
  };
