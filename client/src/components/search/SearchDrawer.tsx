import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDebouncedValue } from "@mantine/hooks";
import {
  Drawer,
  TextInput,
  Stack,
  Text,
  Box,
  Group,
  Loader,
  Divider,
  NavLink,
  ScrollArea,
  Highlight,
  ActionIcon,
} from "@mantine/core";
import { IconSearch, IconMessage, IconMessages, IconFile, IconX } from "@tabler/icons-react";
import { useLazySearchQuery } from "@/store/services/graphql";
import { SearchResults } from "@/types/graphql";
import drawerClasses from "./SearchDrawer.module.scss";

interface SearchDrawerProps {
  opened: boolean;
  onClose: () => void;
}

export const SearchDrawer: React.FC<SearchDrawerProps> = ({ opened, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | undefined>(undefined);
  const [debouncedQuery] = useDebouncedValue(query, 300);
  const [triggerSearch, { data, isLoading, isFetching, isError }] = useLazySearchQuery();

  useEffect(() => {
    if (debouncedQuery.trim().length >= 2) {
      triggerSearch({ query: debouncedQuery, limit: 10 });
    }
  }, [debouncedQuery, triggerSearch]);

  useEffect(() => {
    if (data) {
      setSearchResults(data);
    }
  }, [data]);

  const handleResetSearch = useCallback(() => {
    setQuery("");
    setSearchResults(undefined);
  }, [onClose]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleChatClick = useCallback(
    (chatId: string) => {
      navigate(`/chat/${chatId}`);
      handleClose();
    },
    [navigate, handleClose]
  );

  const handleMessageClick = useCallback(
    (chatId: string, messageId: string) => {
      navigate(`/chat/${chatId}`);
      handleClose();
      const elId = `message-${messageId}`;
      let retries = 0;

      const highlight = () => {
        const el = document.getElementById(elId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("search-highlight");
          setTimeout(() => el.classList.remove("search-highlight"), 3000);
        } else if (retries < 5) {
          retries++;
          setTimeout(highlight, 500);
        }
      };

      setTimeout(highlight, 600);
    },
    [navigate, handleClose]
  );

  const handleDocumentClick = useCallback(
    (documentId: string) => {
      navigate(`/documents/${documentId}`);
      handleClose();
    },
    [navigate, handleClose]
  );

  const hasResults =
    searchResults &&
    (searchResults.chatResults.length > 0 ||
      searchResults.messageResults.length > 0 ||
      searchResults.documentResults.length > 0);
  const noResults = searchResults && !hasResults && debouncedQuery.trim().length >= 2 && !isLoading && !isFetching;
  const searchTerm = debouncedQuery.trim();

  return (
    <Drawer
      opened={opened}
      onClose={handleClose}
      classNames={drawerClasses}
      title={
        <Stack gap="0" w="100%" flex="1">
          <Group gap="xs" align="center" justify="stretch">
            <IconSearch size={18} />
            <Text fw={600}>{t("search.title")}</Text>
          </Group>

          <TextInput
            placeholder={t("search.placeholder")}
            value={query}
            onChange={e => setQuery(e.currentTarget.value)}
            autoFocus
            my="sm"
            me="lg"
            rightSection={
              isLoading || isFetching ? (
                <Loader size="xs" />
              ) : query ? (
                <ActionIcon variant="subtle" size="sm" onClick={handleResetSearch}>
                  <IconX size={14} />
                </ActionIcon>
              ) : null
            }
          />

          {isError && (
            <Text c="red" size="sm" ta="center" mt="xl">
              {t("search.error")}
            </Text>
          )}
        </Stack>
      }
      size="md"
      padding="md"
    >
      <Stack gap="xs">
        {noResults && (
          <Text c="dimmed" size="sm" ta="center" mt="xl">
            {t("search.noResults")}
          </Text>
        )}

        {searchResults && searchResults.chatResults.length > 0 && (
          <Box>
            <Group gap="xs" mb="xs">
              <IconMessages size={14} />
              <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                {t("search.chats")}
              </Text>
            </Group>
            <Stack gap={2}>
              {searchResults.chatResults.map(result => (
                <NavLink
                  key={result.chatId}
                  label={
                    <Highlight highlight={searchTerm} size="sm">
                      {result.title || t("search.untitled")}
                    </Highlight>
                  }
                  onClick={() => handleChatClick(result.chatId)}
                />
              ))}
            </Stack>
            {(searchResults.messageResults.length > 0 || searchResults.documentResults.length > 0) && (
              <Divider mt="xs" />
            )}
          </Box>
        )}

        {searchResults && searchResults.messageResults.length > 0 && (
          <Box>
            <Group gap="xs" mb="xs">
              <IconMessage size={14} />
              <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                {t("search.messages")}
              </Text>
            </Group>
            <Stack gap={2}>
              {searchResults.messageResults.map(result => (
                <NavLink
                  key={result.messageId}
                  label={
                    <Highlight highlight={searchTerm} size="sm">
                      {result.snippet}
                    </Highlight>
                  }
                  description={result.chatTitle}
                  onClick={() => handleMessageClick(result.chatId, result.messageId)}
                />
              ))}
            </Stack>
            {searchResults.documentResults.length > 0 && <Divider mt="xs" />}
          </Box>
        )}

        {searchResults && searchResults.documentResults.length > 0 && (
          <Box>
            <Group gap="xs" mb="xs">
              <IconFile size={14} />
              <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                {t("search.documents")}
              </Text>
            </Group>
            <Stack gap={2}>
              {searchResults.documentResults.map(result => (
                <NavLink
                  key={result.documentId}
                  label={
                    <Highlight highlight={searchTerm} size="sm">
                      {result.fileName}
                    </Highlight>
                  }
                  description={
                    result.snippet ? (
                      <Highlight highlight={searchTerm} size="xs">
                        {result.snippet}
                      </Highlight>
                    ) : undefined
                  }
                  onClick={() => handleDocumentClick(result.documentId)}
                />
              ))}
            </Stack>
          </Box>
        )}
      </Stack>
    </Drawer>
  );
};
