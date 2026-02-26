import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, NavLink, Text, Group, Loader, Accordion, Tooltip } from "@mantine/core";
import { IconDots, IconMessage, IconMessage2Code } from "@tabler/icons-react";
import { useQuery } from "@apollo/client";
import { useDroppable } from "@dnd-kit/core";
import { sortItemsBySections } from "@katechat/ui";
import { useAppSelector, useAppDispatch } from "../../store";
import { GET_CHATS } from "@/store/services/graphql.queries";
import { addChats } from "@/store/slices/chatSlice";
import { DraggableChatRow } from "./DraggableChatRow";

import classes from "./ChatsNavSection.module.scss";
import accordionClasses from "./MenuAccordion.module.scss";
import { GetChatsResponse } from "@/types/graphql";
import { CHAT_PAGE_SIZE } from "@/lib/config";
import { useLocalStorage } from "@mantine/hooks";

const CHATS_TO_SHOW_WHEN_COLLAPSED = 10;

interface IProps {
  navbarToggle?: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export const ChatsNavSection = ({ navbarToggle, expanded = true, onToggleExpand }: IProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [currentChatId, setCurrentChatId] = useState<string>();
  const { chats, loading, error, next } = useAppSelector(state => state.chats);

  // The whole section is a drop target for "unpin and remove from folder"
  const { setNodeRef: setChatsDropRef, isOver: isChatsOver } = useDroppable({
    id: "chats-zone",
    data: { type: "chats" },
  });

  const sortedChats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const ago7Days = new Date(today);
    ago7Days.setDate(ago7Days.getDate() - 7);
    const ago30Days = new Date(today);
    ago30Days.setDate(ago30Days.getDate() - 30);

    return sortItemsBySections(
      chats.filter(chat => !chat.isPristine && !chat.isPinned),
      [
        {
          label: t("chat.today"),
          selector: (ch, dt) =>
            dt.getDate() === today.getDate() &&
            dt.getMonth() === today.getMonth() &&
            dt.getFullYear() === today.getFullYear(),
        },
        {
          label: t("chat.yesterday"),
          selector: (ch, dt) =>
            dt.getDate() === yesterday.getDate() &&
            dt.getMonth() === yesterday.getMonth() &&
            dt.getFullYear() === yesterday.getFullYear(),
        },
        { label: t("chat.last7Days"), selector: (ch, dt: Date) => dt > ago7Days && dt <= today },
        { label: t("chat.last30Days"), selector: (ch, dt: Date) => dt > ago30Days && dt <= today },
        { label: t("chat.older"), selector: false },
      ]
    );
  }, [chats, next, t]);

  const [openHistoryItems, setOpenHistoryItems] = useLocalStorage<string[]>({
    key: "chat-history-menu",
    defaultValue: sortedChats.map(block => block.label),
  });

  const {
    loading: loadingChats,
    error: loadChatsError,
    refetch: fetchNextChats,
  } = useQuery<GetChatsResponse>(GET_CHATS, {
    fetchPolicy: "network-only",
    skip: true,
    onCompleted: data => {
      dispatch(addChats(data.getChats));
    },
    variables: {
      input: { limit: CHAT_PAGE_SIZE, from: next },
    },
  });

  // Track current chat from URL
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith("/chat/")) {
      const id = path.split("/")[2];
      if (id && id !== "new") setCurrentChatId(id);
    } else {
      setCurrentChatId(undefined);
    }
  }, [location]);

  if (loading) {
    return (
      <Group justify="center" p="md">
        <Loader size="sm" />
      </Group>
    );
  }

  if (!expanded) {
    return (
      <>
        {chats.slice(0, CHATS_TO_SHOW_WHEN_COLLAPSED).map(chat => (
          <Tooltip key={chat.id} label={chat.title || t("chat.untitledChat")} position="right">
            <NavLink
              active={chat.id === currentChatId}
              leftSection={<IconMessage size={16} />}
              onClick={() => {
                navbarToggle?.();
                navigate(`/chat/${chat.id}`);
              }}
              pl="md"
            />
          </Tooltip>
        ))}
        {chats.length > CHATS_TO_SHOW_WHEN_COLLAPSED && onToggleExpand && (
          <Tooltip label={t("chat.showAllChats")} position="right">
            <NavLink pl="md" leftSection={<IconDots size={16} />} onClick={onToggleExpand} />
          </Tooltip>
        )}
      </>
    );
  }

  if (error || loadChatsError) {
    return (
      <Text c="red" size="sm" ta="center">
        {t("chat.errorLoadingChats")} {String(error || loadChatsError)}
      </Text>
    );
  }

  if (chats?.length === 0) {
    return (
      <Text c="dimmed" size="sm" ta="center" m="lg">
        {t("chat.noChatsYet")}
      </Text>
    );
  }

  return (
    <div ref={setChatsDropRef} className={isChatsOver ? classes.dropTarget : undefined}>
      <Accordion
        multiple
        p="0"
        variant="default"
        chevronSize="lg"
        value={openHistoryItems}
        onChange={setOpenHistoryItems}
        classNames={accordionClasses}
      >
        {sortedChats.map(block => (
          <Accordion.Item key={block.label} value={block.label}>
            <Accordion.Control icon={block.icon || <IconMessage2Code />}>{block.label}</Accordion.Control>
            <Accordion.Panel>
              {block.items.map(chat => (
                <DraggableChatRow key={chat.id} chat={chat} navbarToggle={navbarToggle} />
              ))}
            </Accordion.Panel>
          </Accordion.Item>
        ))}

        {next ? (
          <Group justify="center" p="md">
            <Button variant="subtle" size="xs" onClick={() => fetchNextChats()} loading={loadingChats}>
              {t("chat.loadMore")}
            </Button>
          </Group>
        ) : null}
      </Accordion>
    </div>
  );
};
