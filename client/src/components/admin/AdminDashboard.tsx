import React, { useState, useEffect } from "react";
import {
  Title,
  Paper,
  Grid,
  Card,
  Text,
  Group,
  Stack,
  Badge,
  Table,
  Loader,
  TextInput,
  Button,
  Alert,
  ActionIcon,
  Tooltip,
  Pagination,
  Select,
  Avatar,
} from "@mantine/core";
import {
  IconUser,
  IconMessage2,
  IconBrandOpenai,
  IconSearch,
  IconRefresh,
  IconAlertCircle,
  IconShield,
} from "@tabler/icons-react";
import { gql, useQuery } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { UserRole } from "@/store/slices/userSlice";

// GraphQL queries
const GET_ADMIN_STATS = gql`
  query GetAdminStats {
    getAdminStats {
      usersCount
      chatsCount
      modelsCount
    }
  }
`;

const GET_USERS = gql`
  query GetUsers($input: GetUsersInput) {
    getUsers(input: $input) {
      users {
        id
        email
        firstName
        lastName
        role
        createdAt
        avatarUrl
        modelsCount
        chatsCount
      }
      total
      hasMore
    }
  }
`;

interface AdminStats {
  usersCount: number;
  chatsCount: number;
  modelsCount: number;
}

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  modelsCount?: number;
  chatsCount?: number;
  createdAt: string;
  avatarUrl?: string;
}

interface GetUsersInput {
  offset?: number;
  limit?: number;
  searchTerm?: string;
}

interface GetUsersResponse {
  users: AdminUser[];
  total: number;
  hasMore: boolean;
}

export const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const itemsPerPage = 10;

  // Get admin stats
  const {
    data: statsData,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useQuery<{ getAdminStats: AdminStats }>(GET_ADMIN_STATS, {
    errorPolicy: "all",
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("admin.failedToLoadStats"),
        color: "red",
      });
    },
  });

  // Get users
  const {
    data: usersData,
    loading: usersLoading,
    error: usersError,
    refetch: refetchUsers,
  } = useQuery<{ getUsers: GetUsersResponse }>(GET_USERS, {
    variables: {
      input: {
        offset: (currentPage - 1) * itemsPerPage,
        limit: itemsPerPage,
        searchTerm: searchTerm || undefined,
      },
    },
    errorPolicy: "all",
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("admin.failedToLoadUsers"),
        color: "red",
      });
    },
  });

  const handleSearch = () => {
    setSearchTerm(searchInput);
    setCurrentPage(1);
  };

  const handleRefresh = () => {
    refetchStats();
    refetchUsers();
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const stats = statsData?.getAdminStats;
  const users = usersData?.getUsers;
  const totalPages = users ? Math.ceil(users.total / itemsPerPage) : 1;

  if (statsError || usersError) {
    const errorMessage = statsError?.message || usersError?.message || "Access denied";
    return (
      <Alert icon={<IconAlertCircle size="1rem" />} title={t("admin.adminRequired")} color="red" variant="light">
        {t("admin.adminRequiredMessage", { message: errorMessage })}
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Title order={2} mb="lg">
          {t("admin.adminDashboard")}
        </Title>
        <Tooltip label={t("admin.refreshData")}>
          <ActionIcon
            variant="light"
            color="blue"
            size="lg"
            onClick={handleRefresh}
            loading={statsLoading || usersLoading}
          >
            <IconRefresh size="1.2rem" />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Stats Cards */}
      <Grid>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <Card withBorder p="md">
            <Group justify="space-between">
              <div>
                <Text c="dimmed" size="sm" fw={500} tt="uppercase">
                  {t("admin.totalUsers")}
                </Text>
                <Text fw={700} size="xl">
                  {statsLoading ? <Loader size="sm" /> : stats?.usersCount || 0}
                </Text>
              </div>
              <IconUser size="2rem" color="blue" opacity={0.6} />
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 4 }}>
          <Card withBorder p="md">
            <Group justify="space-between">
              <div>
                <Text c="dimmed" size="sm" fw={500} tt="uppercase">
                  {t("admin.totalChats")}
                </Text>
                <Text fw={700} size="xl">
                  {statsLoading ? <Loader size="sm" /> : stats?.chatsCount || 0}
                </Text>
              </div>
              <IconMessage2 size="2rem" color="green" opacity={0.6} />
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 4 }}>
          <Card withBorder p="md">
            <Group justify="space-between">
              <div>
                <Text c="dimmed" size="sm" fw={500} tt="uppercase">
                  {t("admin.totalModels")}
                </Text>
                <Text fw={700} size="xl">
                  {statsLoading ? <Loader size="sm" /> : stats?.modelsCount || 0}
                </Text>
              </div>
              <IconBrandOpenai size="2rem" color="orange" opacity={0.6} />
            </Group>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Users Management */}
      <Paper withBorder p="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={2}>{t("admin.usersManagement")}</Title>
            <Group>
              <TextInput
                placeholder={t("admin.searchUsers")}
                value={searchInput}
                onChange={e => setSearchInput(e.currentTarget.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                rightSection={
                  <ActionIcon variant="light" onClick={handleSearch} loading={usersLoading}>
                    <IconSearch size="1rem" />
                  </ActionIcon>
                }
              />
            </Group>
          </Group>

          {usersLoading ? (
            <Group justify="center" p="xl">
              <Loader size="lg" />
            </Group>
          ) : users && users.users.length > 0 ? (
            <>
              <Table striped highlightOnHover horizontalSpacing="sm" style={{ tableLayout: "fixed", width: "100%" }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th visibleFrom="lg" w="30%">
                      {t("common.name")}
                    </Table.Th>
                    <Table.Th w="30%">{t("admin.email")}</Table.Th>
                    <Table.Th visibleFrom="lg">{t("admin.role")}</Table.Th>
                    <Table.Th visibleFrom="lg">{t("admin.modelsChats")}</Table.Th>
                    <Table.Th visibleFrom="lg">{t("admin.joined")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {users.users.map(user => (
                    <Table.Tr key={user.id}>
                      <Table.Td visibleFrom="lg">
                        <Group>
                          <Avatar color="gray" radius="xl" src={user.avatarUrl} />
                          <Text fw={500}>
                            {user.firstName} {user.lastName}
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Avatar color="gray" size="sm" radius="xl" src={user.avatarUrl} hiddenFrom="lg" />
                          <Text>{user.email}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td visibleFrom="lg">
                        <Badge
                          color={user.role === UserRole.ADMIN ? "red" : "blue"}
                          variant="light"
                          leftSection={
                            user.role === UserRole.ADMIN ? <IconShield size="0.8rem" /> : <IconUser size="0.8rem" />
                          }
                        >
                          {user.role}
                        </Badge>
                      </Table.Td>
                      <Table.Td visibleFrom="lg">
                        {user.modelsCount || 0}/{user.chatsCount || 0}
                      </Table.Td>
                      <Table.Td visibleFrom="lg">
                        <Text size="sm">{new Date(user.createdAt).toLocaleDateString()}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>

              {totalPages > 1 && (
                <Group justify="center" mt="md">
                  <Pagination value={currentPage} onChange={handlePageChange} total={totalPages} size="sm" />
                </Group>
              )}

              <Text size="sm" c="dimmed" ta="center">
                {t("admin.showingUsers", { count: users.users.length, total: users.total })}
              </Text>
            </>
          ) : (
            <Text ta="center" c="dimmed" py="xl">
              {t("admin.noUsersFound")}
            </Text>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
};
