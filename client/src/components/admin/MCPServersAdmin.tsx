import React, { useState } from "react";
import {
  Paper,
  Text,
  Group,
  Stack,
  Badge,
  Table,
  Loader,
  Button,
  Alert,
  ActionIcon,
  Tooltip,
  Card,
  em,
  Flex,
  Grid,
} from "@mantine/core";
import {
  IconPlus,
  IconRefresh,
  IconAlertCircle,
  IconTrash,
  IconEdit,
  IconPlugConnected,
  IconTool,
} from "@tabler/icons-react";
import { gql, useQuery, useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { useMediaQuery } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { MCPToolsDialog } from "./MCPToolsDialog";
import { MCPServerFormDialog } from "./MCPServerFormDialog";
import { MCPServer } from "@/types/graphql";
import { MOBILE_BREAKPOINT } from "@/lib/config";
import { DELETE_MCP_SERVER, GET_MCP_SERVERS } from "@/store/services/graphql.queries";

const AUTH_TYPES = [
  { value: "NONE", label: "No Authentication" },
  { value: "API_KEY", label: "API Key" },
  { value: "BEARER", label: "Bearer Token" },
];

export const MCPServersAdmin: React.FC = () => {
  const { t } = useTranslation();
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<MCPServer | null>(null);
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);

  // Queries
  const {
    data: serversData,
    loading: serversLoading,
    refetch: refetchServers,
  } = useQuery(GET_MCP_SERVERS, {
    errorPolicy: "all",
  });

  // Mutations
  const [deleteServer] = useMutation(DELETE_MCP_SERVER, {
    onCompleted: () => {
      refetchServers();
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message,
        color: "red",
      });
    },
  });

  const handleDeleteServer = (server: MCPServer) => {
    modals.openConfirmModal({
      title: t("mcp.deleteMcpServer"),
      children: <Text size="sm">{t("mcp.deleteMcpServerMessage", { name: server.name })}</Text>,
      labels: { confirm: t("common.delete"), cancel: t("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => deleteServer({ variables: { input: { id: server.id } } }),
    });
  };

  const handleEditServer = (server: MCPServer) => {
    setSelectedServer(server);
    setIsFormDialogOpen(true);
  };

  const handleAddServer = () => {
    setSelectedServer(null);
    setIsFormDialogOpen(true);
  };

  const handleViewTools = (server: MCPServer) => {
    setSelectedServer(server);
    setIsToolsModalOpen(true);
  };

  const handleServerDialogClose = () => {
    setIsFormDialogOpen(false);
    setSelectedServer(null);
  };

  const { servers = [], error: serversError }: { servers?: MCPServer[]; error?: string } =
    serversData?.getMCPServers || {};

  if (serversError) {
    return (
      <Alert icon={<IconAlertCircle size="1rem" />} title={t("common.error")} color="red" variant="light">
        Failed to load MCP servers: {serversError}
      </Alert>
    );
  }

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="center">
        <Group>
          <Tooltip label={t("common.refresh")}>
            <ActionIcon
              variant="light"
              color="blue"
              size="lg"
              onClick={() => refetchServers()}
              loading={serversLoading}
            >
              <IconRefresh size="1.2rem" />
            </ActionIcon>
          </Tooltip>
          <Button leftSection={<IconPlus size="1rem" />} onClick={handleAddServer}>
            {t("mcp.addServer")}
          </Button>
        </Group>
      </Group>

      <Text c="dimmed" size="sm">
        {t("mcp.mcpDescription")}
      </Text>

      {serversLoading ? (
        <Group justify="center" p="xl">
          <Loader size="lg" />
        </Group>
      ) : servers.length === 0 ? (
        <Paper withBorder p="xl" ta="center">
          <IconPlugConnected size="3rem" style={{ opacity: 0.3 }} />
          <Text size="lg" mt="md" c="dimmed">
            {t("mcp.noServersTitle")}
          </Text>
          <Text size="sm" c="dimmed">
            {t("mcp.noServersSubtitle")}
          </Text>
          <Button mt="md" leftSection={<IconPlus size="1rem" />} onClick={handleAddServer}>
            {t("mcp.addFirstServer")}
          </Button>
        </Paper>
      ) : (
        <Grid gutter="lg">
          {servers.map((server: any) => (
            <Grid.Col key={server.id} span={{ base: 12, md: 6, lg: 4 }}>
              <Card key={server.id} withBorder padding="md" mih="12rem">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Group gap="sm" wrap="nowrap">
                      <IconPlugConnected size="1rem" />
                      <Text fw={600} truncate>
                        {server.name}
                      </Text>
                    </Group>
                    <Text size="sm" c="dimmed" style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                      {server.url}
                    </Text>
                    {server.description && (
                      <Text size="sm" c="dimmed" lineClamp={2}>
                        {server.description}
                      </Text>
                    )}
                  </Stack>
                  <ActionIcon.Group>
                    <Tooltip label={t("mcp.viewTools")}>
                      <ActionIcon variant="light" color="blue" size="lg" onClick={() => handleViewTools(server)}>
                        <IconTool size="20" />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={t("common.edit")}>
                      <ActionIcon variant="light" color="gray" size="lg" onClick={() => handleEditServer(server)}>
                        <IconEdit size="20" />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={t("common.delete")}>
                      <ActionIcon variant="light" color="red" size="lg" onClick={() => handleDeleteServer(server)}>
                        <IconTrash size="20" />
                      </ActionIcon>
                    </Tooltip>
                  </ActionIcon.Group>
                </Group>
                <Group gap="sm" mt="sm">
                  <Badge variant="light" color="blue" size="sm">
                    {t("mcp.toolsCount", { count: server.tools?.length || 0 })}
                  </Badge>
                  <Badge variant="light" color={server.authType === "NONE" ? "gray" : "blue"} size="sm">
                    {AUTH_TYPES.find(at => at.value === server.authType)?.label || server.authType}
                  </Badge>
                  <Badge color={server.isActive ? "green" : "red"} size="sm">
                    {server.isActive ? t("common.active") : t("common.inactive")}
                  </Badge>
                </Group>
              </Card>
            </Grid.Col>
          ))}
        </Grid>
      )}

      {/* Add/Edit Server Dialog */}
      <MCPServerFormDialog
        opened={isFormDialogOpen}
        onClose={handleServerDialogClose}
        server={selectedServer}
        onSuccess={refetchServers}
        fullScreen={isMobile}
      />

      {/* Tools Dialog */}
      <MCPToolsDialog
        opened={isToolsModalOpen}
        onClose={() => setIsToolsModalOpen(false)}
        server={selectedServer}
        onToolsRefetched={refetchServers}
        fullScreen={isMobile}
      />
    </Stack>
  );
};
