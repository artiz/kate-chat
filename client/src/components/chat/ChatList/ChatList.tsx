import React, { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Title, Text, Grid, Card, Button, Group, Stack, Divider, Alert } from "@mantine/core";
import { IconPlus, IconMessage } from "@tabler/icons-react";
import { ChatMessagePreview } from "@katechat/ui";
import { useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { useAppSelector, useAppDispatch } from "@/store";
import { addChats } from "@/store/slices/chatSlice";
import { GET_CHATS } from "@/store/services/graphql.queries";
import { GetChatsResponse } from "@/types/graphql";
import { CHAT_PAGE_SIZE } from "@/lib/config";

export const ChatList: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { chats, error, next } = useAppSelector(state => state.chats);

  const { loading: loadingChats, refetch: fetchNextChats } = useQuery<GetChatsResponse>(GET_CHATS, {
    fetchPolicy: "network-only",
    skip: true,
    onCompleted: data => {
      dispatch(addChats(data.getChats));
    },
    variables: {
      input: {
        limit: CHAT_PAGE_SIZE,
        from: next,
      },
    },
  });

  const { providers } = useAppSelector(state => state.models);
  const noActiveProviders = useMemo(() => {
    return providers.length === 0 || !providers.some(provider => provider.isConnected);
  }, [providers]);

  // Handle creating a new chat or using existing pristine chat
  const handleNewChat = () => {
    navigate("/chat/new");
  };

  // Handle opening an existing chat
  const handleOpenChat = (id: string) => {
    navigate(`/chat/${id}`);
  };

  if (error) {
    return <Text c="red">{t("chat.errorLoadingChats")}</Text>;
  }

  if (noActiveProviders) {
    return (
      <Alert color="yellow" title={t("chat.noActiveProviders")}>
        <div>
          {t("chat.noActiveProvidersMessage")}
          <ol>
            <li>
              <Link to="/settings">{t("chat.configureProvider")}</Link>
            </li>
            <li>
              <Link to="/models">{t("chat.thenFetchModels")}</Link>
            </li>
            <li>{t("chat.afterThatCreateChat")}</li>
          </ol>
        </div>
      </Alert>
    );
  }

  if (chats.length === 0) {
    return (
      <>
        <Group justify="space-between" mb="lg">
          <Title order={2}>{t("chat.yourChats")}</Title>
          <Button leftSection={<IconPlus size={16} />} onClick={handleNewChat}>
            {t("chat.newChat")}
          </Button>
        </Group>
        <Stack align="center" justify="center" h={300} gap="md">
          <IconMessage size={64} opacity={0.3} />
          <Text size="lg" fw={500} ta="center">
            {t("chat.noChatsYet")}
          </Text>
          <Text size="sm" c="dimmed" ta="center" maw={500}>
            {t("chat.startNewConversation")}
          </Text>
          <Button onClick={handleNewChat} mt="md">
            {t("chat.createFirstChat")}
          </Button>
        </Stack>
      </>
    );
  }

  return (
    <>
      <Group justify="space-between" mb="lg">
        <Title order={2}>{t("chat.yourChats")}</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={handleNewChat}>
          {t("chat.newChat")}
        </Button>
      </Group>
      <Grid>
        {chats
          .filter(c => !c.isPristine)
          .map(chat => (
            <Grid.Col key={chat.id} span={{ base: 12, sm: 6, md: 4 }}>
              <Card withBorder padding="md" radius="md">
                <Group
                  m="0"
                  align="center"
                  justify="space-between"
                  onClick={() => handleOpenChat(chat.id)}
                  style={{ cursor: "pointer" }}
                >
                  <Text fw={500} size="lg" mb="xs" truncate>
                    {chat.title || t("chat.untitledChat")}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {new Date(chat.updatedAt).toLocaleDateString()}
                  </Text>
                  <Text size="sm">
                    <b>{chat.messagesCount}</b> {t("chat.messages")}
                  </Text>
                </Group>
                <Divider />

                <ChatMessagePreview html={chat.lastBotMessageHtml} text={chat.lastBotMessage} />
              </Card>
            </Grid.Col>
          ))}
      </Grid>
      {next ? (
        <Group justify="center" mt="md">
          <Button variant="subtle" size="xs" onClick={() => fetchNextChats()} loading={loadingChats}>
            {t("chat.loadMore")}
          </Button>
        </Group>
      ) : null}
    </>
  );
};
