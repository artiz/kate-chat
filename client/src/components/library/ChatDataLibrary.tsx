import React, { useCallback, useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { Anchor, Badge, Button, Center, Group, Loader, Stack, Table, Text } from "@mantine/core";
import { IconFileText, IconExternalLink, IconDownload } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { GET_CHAT_FILES } from "@/store/services/graphql.queries";
import { GetChatFilesInput, GetChatFilesResponse, LibraryChatFile } from "@/types/graphql";
import { useAppSelector } from "@/store";
import { APP_API_URL } from "@/lib/config";

/** Library "Chat Data": inline chat-context files (PDF/text) uploaded to chats */
export const ChatDataLibrary: React.FC = () => {
  const { t } = useTranslation();
  const client = useApolloClient();
  const navigate = useNavigate();
  const { currentUser } = useAppSelector(state => state.user);

  const [files, setFiles] = useState<LibraryChatFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextPage, setNextPage] = useState<number | undefined>();

  useEffect(() => {
    setFiles([]);
  }, [currentUser?.id]);

  const loadFiles = useCallback(
    async (offset = 0, limit = 50) => {
      try {
        setLoading(true);

        const input: GetChatFilesInput = { offset, limit };
        const response = await client.query<GetChatFilesResponse>({
          query: GET_CHAT_FILES,
          variables: { input },
          fetchPolicy: "no-cache",
        });

        const data = response.data.getChatFiles;
        if (data.error) {
          notifications.show({ title: t("common.error"), message: data.error, color: "red" });
          return;
        }

        setFiles(prev => (offset === 0 ? data.files : [...prev, ...data.files]));
        setNextPage(data.nextPage);
      } catch (err) {
        notifications.show({
          title: t("common.error"),
          message: t("library.failedToReload", { error: err instanceof Error ? err.message : String(err) }),
          color: "red",
        });
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const loadMore = useCallback(() => {
    if (!loading && nextPage) {
      loadFiles(nextPage);
    }
  }, [loading, nextPage, loadFiles]);

  if (loading && files.length === 0) {
    return (
      <Center h="50vh">
        <Stack align="center">
          <Loader size="xl" />
          <Text>{t("library.loadingFiles")}</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      <Text c="dimmed">{t("library.chatDataSubtitle")}</Text>

      {files.length === 0 && !loading ? (
        <Center h="50vh">
          <Stack align="center" gap="md">
            <IconFileText size={64} color="var(--mantine-color-gray-5)" />
            <Text size="lg" c="dimmed">
              {t("library.noFilesFound")}
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              {t("library.uploadFilesHint")}
            </Text>
          </Stack>
        </Center>
      ) : (
        <Table.ScrollContainer minWidth={640}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("library.fileName")}</Table.Th>
                <Table.Th>{t("library.fileType")}</Table.Th>
                <Table.Th>{t("library.fileChat")}</Table.Th>
                <Table.Th>{t("library.fileUploaded")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {files.map(file => (
                <Table.Tr key={file.id}>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <IconFileText size={18} />
                      <Text size="sm" truncate maw={280} title={file.uploadFile || file.fileName}>
                        {file.uploadFile || file.fileName}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{file.mime?.split("/").pop() || "file"}</Badge>
                  </Table.Td>
                  <Table.Td>
                    {file.chat?.id ? (
                      <Anchor size="sm" onClick={() => navigate(`/chat/${file.chat.id}`)}>
                        <Group gap={4} wrap="nowrap">
                          <Text size="sm" truncate maw={220}>
                            {file.chat.title}
                          </Text>
                          <IconExternalLink size={14} />
                        </Group>
                      </Anchor>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {new Date(file.createdAt).toLocaleString()}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Anchor
                      href={`${APP_API_URL}${file.fileUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("library.downloadFile")}
                    >
                      <IconDownload size={18} />
                    </Anchor>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {nextPage && files.length > 0 && (
        <Center mt="lg">
          <Button variant="outline" loading={loading} onClick={loadMore}>
            {t("library.loadMoreFiles")}
          </Button>
        </Center>
      )}
    </Stack>
  );
};
