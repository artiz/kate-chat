import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Box, Group, Alert, Text, Stack, ScrollArea } from "@mantine/core";
import { parseMarkdown } from "@katechat/ui";
import { Document } from "@/types/graphql";
import { getStatusColor } from "@/types/ai";

interface DocumentInfoProps {
  document: Document;
}

export const DocumentInfo: React.FC<DocumentInfoProps> = ({ document }) => {
  const { t } = useTranslation();
  const [processedSummary, setProcessedSummary] = useState<string>("");

  useEffect(() => {
    if (!document?.summary) {
      setProcessedSummary("");
    } else {
      try {
        const summary = parseMarkdown(document.summary || "");
        setProcessedSummary(summary.join("\n"));
      } catch (err: unknown) {
        console.error("Error processing markdown", err);
        setProcessedSummary("Error processing summary: " + (err instanceof Error ? err.message : String(err)));
      }
    }
  }, [document?.summary]);

  const fileSizeKb = document?.fileSize ? Math.round(document.fileSize / 1024) : null;

  if (!document) {
    return null;
  }

  return (
    <Stack gap="sm">
      <Group gap="xl">
        <Group>
          <Badge color={getStatusColor(document.status)} p="sm">
            {document.status}
          </Badge>
          <Box size="sm" fz="12">
            {document.statusInfo}
          </Box>
        </Group>

        {(fileSizeKb !== null || document.createdAt) && (
          <Group gap="lg">
            {fileSizeKb !== null && (
              <Stack gap={2}>
                <Text size="xs" c="dimmed">
                  {t("documents.fileSize")}
                </Text>
                <Text size="sm">{fileSizeKb} KB</Text>
              </Stack>
            )}
            {document.createdAt && (
              <Stack gap={2}>
                <Text size="xs" c="dimmed">
                  {t("documents.uploaded")}
                </Text>
                <Text size="sm">{new Date(document.createdAt).toLocaleDateString()}</Text>
              </Stack>
            )}
          </Group>
        )}
      </Group>

      <ScrollArea.Autosize mah={"40vh"}>
        <Box size="sm" fz="12">
          <div dangerouslySetInnerHTML={{ __html: processedSummary }} />
        </Box>
      </ScrollArea.Autosize>

      <Group w="100%" my="md" align="stretch">
        {document.summaryModelId && (
          <Alert p="md" title={t("documents.summarizationModel")} color="blue">
            {document.summaryModelId}
          </Alert>
        )}
        {document.embeddingsModelId && (
          <Alert p="md" title={t("documents.embeddingsModel")} color="indigo">
            {document.embeddingsModelId}
          </Alert>
        )}

        <Alert p="md" title={t("documents.processingAlert")} color="green">
          <Stack gap="xs">
            <Group gap="lg" align="center" justify="space-between">
              <Text fz="12">{t("documents.pages")}</Text>
              <Text>
                {document.statusProgress && (document.pagesCount || 1) > 1
                  ? `${Math.round(document.statusProgress * (document.pagesCount || 1))} / `
                  : ""}
                {document.pagesCount || 1}
              </Text>
            </Group>
            {document.metadata?.batchingPagePerSecond && (
              <Group gap="lg" align="center" justify="space-between">
                <Text fz="12">{t("documents.batchingPagesPerSec")}</Text>
                <Text>{document.metadata.batchingPagePerSecond.toFixed(2)}</Text>
              </Group>
            )}
            {document.metadata?.parsingPagePerSecond && (
              <Group gap="lg" align="center" justify="space-between">
                <Text fz="12">{t("documents.parsingPagesPerSec")}</Text>
                <Text>{document.metadata.parsingPagePerSecond.toFixed(2)}</Text>
              </Group>
            )}
            {document.metadata?.chunkingPagePerSecond && (
              <Group gap="lg" align="center" justify="space-between">
                <Text fz="12">{t("documents.chunkingPagesPerSec")}</Text>
                <Text>{document.metadata.chunkingPagePerSecond.toFixed(2)}</Text>
              </Group>
            )}
            {document.metadata?.embeddingPagePerSecond && (
              <Group gap="lg" align="center" justify="space-between">
                <Text fz="12">{t("documents.embeddingPagesPerSec")}</Text>
                <Text>{document.metadata.embeddingPagePerSecond.toFixed(2)}</Text>
              </Group>
            )}
          </Stack>
        </Alert>
      </Group>
    </Stack>
  );
};
