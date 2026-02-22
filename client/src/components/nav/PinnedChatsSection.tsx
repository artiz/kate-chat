import React, { useCallback, useState } from "react";
import { Group, Box, Button, Accordion, Text } from "@mantine/core";
import { IconFolderPlus, IconPinFilled } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@apollo/client";
import { useDroppable } from "@dnd-kit/core";
import { useAppSelector, useAppDispatch } from "@/store";
import { GET_CHATS } from "@/store/services/graphql.queries";
import { addPinnedChats } from "@/store/slices/chatSlice";
import { GetChatsResponse } from "@/types/graphql";
import { FolderItem } from "./FolderItem";
import { NewFolderModal } from "./NewFolderModal";
import { DraggableChatRow } from "./DraggableChatRow";
import { CHAT_PAGE_SIZE } from "@/lib/config";
import { Tooltip } from "@mantine/core";

import accordionClasses from "./MenuAccordion.module.scss";
import classes from "./ChatsNavSection.module.scss";
import { useLocalStorage } from "@mantine/hooks";

interface IProps {
  navbarToggle?: () => void;
  expanded?: boolean;
}

export const PinnedChatsSection: React.FC<IProps> = ({ navbarToggle, expanded = true }) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const [showNewFolderModal, setShowNewFolderModal] = useState(false);

  const { pinnedChats, pinnedNext } = useAppSelector(state => state.chats);
  const { folders } = useAppSelector(state => state.folders);

  const [openMenu, setOpenMenu] = useLocalStorage<string[]>({
    key: "pinned-chats-menu",
    defaultValue: ["pinned"],
  });

  const barePinnedChats = pinnedChats.filter(c => !c.isPristine && c.isPinned && !c.folderId);

  // The whole panel is a drop zone for "pinned (no folder)"
  const { setNodeRef: setPinnedDropRef, isOver: isPinnedOver } = useDroppable({
    id: "pinned-zone",
    data: { type: "pinned" },
  });

  const { loading: loadingMore, refetch: fetchMorePinned } = useQuery<GetChatsResponse>(GET_CHATS, {
    fetchPolicy: "network-only",
    skip: true,
    onCompleted: data => {
      dispatch(addPinnedChats(data.getChats));
    },
    variables: {
      input: { pinned: true, limit: CHAT_PAGE_SIZE, from: pinnedNext },
    },
  });

  const handleNewFolder = useCallback((evt: React.MouseEvent<HTMLDivElement>) => {
    evt.stopPropagation();
    setShowNewFolderModal(true);
  }, []);

  if (!expanded) return null;
  if (folders.length === 0 && barePinnedChats.length === 0) return null;

  return (
    <>
      <Accordion
        multiple
        p="0"
        variant="default"
        chevronSize="lg"
        value={openMenu}
        onChange={setOpenMenu}
        classNames={accordionClasses}
      >
        <Accordion.Item value="pinned">
          <Accordion.Control icon={<IconPinFilled />}>
            <Group justify="space-between" p="0" m="0">
              <Box>{t("chat.pinned")}</Box>
              <Tooltip label={t("chat.folder.new")} withArrow>
                <Box className="mantine-focus-auto mantine-active" mr="md" my="0" onClick={handleNewFolder}>
                  <IconFolderPlus size={20} />
                </Box>
              </Tooltip>
            </Group>
          </Accordion.Control>

          <Accordion.Panel>
            {/* Folders */}
            {folders.map(folder => (
              <FolderItem key={folder.id} folder={folder} navbarToggle={navbarToggle} />
            ))}

            {/* Bare pinned chats (no folder) — this area is a drop target */}
            <div ref={setPinnedDropRef} className={isPinnedOver ? classes.dropTarget : classes.unpinnedChatsContainer}>
              {barePinnedChats.map(chat => (
                <DraggableChatRow key={chat.id} chat={chat} pl="sm" navbarToggle={navbarToggle} />
              ))}
              {barePinnedChats.length === 0 ? (
                <Text c="dimmed" px="md">
                  ...
                </Text>
              ) : null}
            </div>

            {pinnedNext != null && (
              <Group justify="center" pb="xs">
                <Button variant="subtle" size="xs" loading={loadingMore} onClick={() => fetchMorePinned()}>
                  {t("chat.loadMore")}
                </Button>
              </Group>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <NewFolderModal isOpen={showNewFolderModal} onClose={() => setShowNewFolderModal(false)} />
    </>
  );
};
