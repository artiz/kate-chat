import React, { useMemo } from "react";
import {
  Stack,
  Title,
  Button,
  Group,
  Text,
  Card,
  ActionIcon,
  Menu,
} from "@mantine/core";
import {
  IconPlus,
  IconMessage,
  IconDots,
  IconTrash,
  IconPin,
  IconPinFilled,
} from "@tabler/icons-react";
import { sortItemsBySections } from "@katechat/ui";
import { Chat } from "../lib/db";

interface ChatListProps {
  chats: Chat[];
  currentChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onTogglePin?: (chat: Chat) => void;
}

export const ChatList: React.FC<ChatListProps> = ({
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onTogglePin,
}) => {
  // Define sections for sorting
  const sections = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    return [
      {
        label: "Pinned",
        selector: (item: any) => !!(item as Chat).isPinned,
      },
      {
        label: "Today",
        selector: (item: any, date: Date) => {
          return !(item as Chat).isPinned && date >= today;
        },
      },
      {
        label: "Yesterday",
        selector: (item: any, date: Date) => {
          return !(item as Chat).isPinned && date >= yesterday && date < today;
        },
      },
      {
        label: "Last 7 days",
        selector: (item: any, date: Date) => {
          return (
            !(item as Chat).isPinned && date >= lastWeek && date < yesterday
          );
        },
      },
      {
        label: "Last 30 days",
        selector: (item: any, date: Date) => {
          return (
            !(item as Chat).isPinned && date >= lastMonth && date < lastWeek
          );
        },
      },
      {
        label: "Older",
        selector: false as const,
      },
    ];
  }, []);

  const sortedChats = useMemo(() => {
    return sortItemsBySections(chats, sections);
  }, [chats, sections]);

  if (chats.length === 0) {
    return (
      <Stack align="center" justify="center" h="100%" gap="md">
        <IconMessage size={64} opacity={0.3} />
        <Text size="lg" fw={500} ta="center">
          No chats yet
        </Text>
        <Text size="sm" c="dimmed" ta="center" maw={300}>
          Start a new conversation with an AI model
        </Text>
        <Button onClick={onNewChat} leftSection={<IconPlus size={16} />}>
          New Chat
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="md" h="100%">
      <Group justify="space-between">
        <Title order={4}>Chats</Title>
        <Button
          onClick={onNewChat}
          leftSection={<IconPlus size={16} />}
          size="xs"
        >
          New
        </Button>
      </Group>

      <Stack gap="lg" style={{ flex: 1, overflowY: "auto" }}>
        {sortedChats.map((section) => (
          <div key={section.label}>
            <Text size="xs" c="dimmed" fw={600} mb="xs" tt="uppercase">
              {section.label}
            </Text>
            <Stack gap="xs">
              {section.items.map((chat) => (
                <Card
                  key={chat.id}
                  withBorder
                  padding="sm"
                  radius="md"
                  style={{
                    cursor: "pointer",
                    backgroundColor:
                      currentChatId === chat.id
                        ? "var(--mantine-color-blue-light)"
                        : undefined,
                  }}
                  onClick={() => onSelectChat(chat.id)}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs">
                        {chat.isPinned && (
                          <IconPinFilled size={14} opacity={0.6} />
                        )}
                        <Text
                          size="sm"
                          fw={500}
                          truncate
                          style={{ flex: 1, minWidth: 0 }}
                        >
                          {chat.title}
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed">
                        {new Date(chat.updatedAt).toLocaleDateString()}
                      </Text>
                    </Stack>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {onTogglePin && (
                          <Menu.Item
                            leftSection={
                              chat.isPinned ? (
                                <IconPin size={16} />
                              ) : (
                                <IconPinFilled size={16} />
                              )
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              onTogglePin(chat);
                            }}
                          >
                            {chat.isPinned ? "Unpin" : "Pin"}
                          </Menu.Item>
                        )}
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={16} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteChat(chat.id);
                          }}
                        >
                          Delete
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Card>
              ))}
            </Stack>
          </div>
        ))}
      </Stack>
    </Stack>
  );
};
