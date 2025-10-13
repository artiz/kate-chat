import React from "react";
import { Text, Box, Group } from "@mantine/core";
import { Message, Document } from "@/types/graphql";
import { IconClipboardData, IconFileSearch, IconReportSearch } from "@tabler/icons-react";

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
        <>
          <Group justify="flex-start" align="center" gap="xs">
            {relevantsChunks.length ? <IconReportSearch size={16} /> : <IconFileSearch size={16} />}
            <Text fw={600} size="sm">
              {relevantsChunks.length ? "RAG search results" : "RAG search"}
            </Text>
          </Group>

          <div key="rag-search">
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
        </>
      );

      detailsNodes.push(cmp);
    }

    if (relevantsChunks.length) {
      const cmp = (
        <div key="rag-chunks">
          <Group justify="flex-start" align="center" gap="xs" mt="lg">
            <IconClipboardData size={16} />
            <Text fw={600} size="sm">
              Related chunks
            </Text>
          </Group>

          {relevantsChunks.map((chunk, idx) => (
            <div key={idx}>
              <Text size="xs" c="dimmed">
                {chunk.documentName || chunk.id} (Page {chunk.page})
              </Text>
              <Text size="xs" c="dimmed">
                Relevance: {chunk.relevance || "N/A"}
              </Text>
              <Box fz="12">
                <pre>{chunk.content}</pre>
              </Box>
            </div>
          ))}
        </div>
      );

      detailsNodes.push(cmp);
    }

    return detailsNodes.length ? detailsNodes : null;
  };
