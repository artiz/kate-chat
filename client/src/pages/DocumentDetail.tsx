import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Container, Group, Text, Stack, Button, Anchor, Paper, Title, Loader, Center, Alert } from "@mantine/core";
import { IconArrowLeft, IconDownload, IconAlertCircle } from "@tabler/icons-react";
import { useDocumentByIdQuery } from "@/store/services/graphql";
import { DocumentInfo } from "@/components/documents/DocumentInfo";

export const DocumentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: document, isLoading, isError } = useDocumentByIdQuery(id!, { skip: !id });

  if (isLoading) {
    return (
      <Center h={300}>
        <Loader />
      </Center>
    );
  }

  if (isError || !document) {
    return (
      <Container size="md" py="xl">
        <Alert icon={<IconAlertCircle />} color="red" title={t("common.error")}>
          {t("documents.notFound")}
        </Alert>
        <Button
          mt="md"
          leftSection={<IconArrowLeft size={16} />}
          variant="subtle"
          onClick={() => navigate("/documents")}
        >
          {t("documents.backToDocuments")}
        </Button>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Group>
          <Button leftSection={<IconArrowLeft size={16} />} variant="subtle" onClick={() => navigate("/documents")}>
            {t("documents.backToDocuments")}
          </Button>
        </Group>

        <Paper p="lg" withBorder>
          <Stack gap="md">
            <Title order={3} style={{ wordBreak: "break-word" }}>
              {document.fileName}
            </Title>

            <DocumentInfo document={document} />

            {(document.downloadUrl || document.downloadUrlMarkdown) && (
              <Stack gap={4}>
                <Text size="sm" fw={600}>
                  {t("documents.downloads")}
                </Text>
                <Group gap="md">
                  {document.downloadUrl && (
                    <Anchor href={document.downloadUrl} target="_blank">
                      <Group gap={4}>
                        <IconDownload size={14} />
                        <Text size="sm">{t("documents.downloadOriginal")}</Text>
                      </Group>
                    </Anchor>
                  )}
                  {document.downloadUrlMarkdown && (
                    <Anchor href={document.downloadUrlMarkdown} target="_blank">
                      <Group gap={4}>
                        <IconDownload size={14} />
                        <Text size="sm">{t("documents.downloadMarkdown")}</Text>
                      </Group>
                    </Anchor>
                  )}
                </Group>
              </Stack>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
};
