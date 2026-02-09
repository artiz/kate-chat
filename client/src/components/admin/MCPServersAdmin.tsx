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
import { MCPToolsDialog } from "./MCPToolsDialog";
import { MCPServerFormDialog } from "./MCPServerFormDialog";
import { MCPServer } from "@/types/graphql";
import { MOBILE_BREAKPOINT } from "@/lib/config";

// GraphQL queries and mutations
const GET_MCP_SERVERS = gql`
  query GetMCPServers {
    getMCPServers {
      servers {
        id
        name
        url
        description
        transportType
        authType
        authConfig {
          headerName
          clientId
          clientSecret
          tokenUrl
          authorizationUrl
          scope
        }
        tools {
          name
          description
          inputSchema
          outputSchema
        }
        isActive
        createdAt
        updatedAt
      }
      total
      error
    }
  }
`;

const DELETE_MCP_SERVER = gql`
  mutation DeleteMCPServer($input: DeleteMCPServerInput!) {
    deleteMCPServer(input: $input)
  }
`;

const AUTH_TYPES = [
  { value: "NONE", label: "No Authentication" },
  { value: "API_KEY", label: "API Key" },
  { value: "BEARER", label: "Bearer Token" },
];

export const MCPServersAdmin: React.FC = () => {
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
      notifications.show({
        title: "Success",
        message: "MCP server deleted successfully",
        color: "green",
      });
      refetchServers();
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  const handleDeleteServer = (server: MCPServer) => {
    modals.openConfirmModal({
      title: "Delete MCP Server",
      children: <Text size="sm">Are you sure you want to delete "{server.name}"? This action cannot be undone.</Text>,
      labels: { confirm: "Delete", cancel: "Cancel" },
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
      <Alert icon={<IconAlertCircle size="1rem" />} title="Error" color="red" variant="light">
        Failed to load MCP servers: {serversError}
      </Alert>
    );
  }

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="center">
        <Group>
          <Tooltip label="Refresh">
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
            Add Server
          </Button>
        </Group>
      </Group>

      <Text c="dimmed" size="sm">
        Register external MCP (Model Context Protocol) servers to extend AI capabilities with custom tools.
      </Text>

      {serversLoading ? (
        <Group justify="center" p="xl">
          <Loader size="lg" />
        </Group>
      ) : servers.length === 0 ? (
        <Paper withBorder p="xl" ta="center">
          <IconPlugConnected size="3rem" style={{ opacity: 0.3 }} />
          <Text size="lg" mt="md" c="dimmed">
            No MCP servers registered
          </Text>
          <Text size="sm" c="dimmed">
            Add an MCP server to extend AI with custom tools
          </Text>
          <Button mt="md" leftSection={<IconPlus size="1rem" />} onClick={handleAddServer}>
            Add Your First Server
          </Button>
        </Paper>
      ) : (
        <Flex gap="sm" wrap="wrap">
          {servers.map((server: any) => (
            <Card key={server.id} withBorder padding="sm" radius="md">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap="xs">
                    <IconPlugConnected size="1rem" />
                    <Text fw={600} size="sm" truncate>
                      {server.name}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed" style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                    {server.url}
                  </Text>
                  {server.description && (
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {server.description}
                    </Text>
                  )}
                </Stack>
                <ActionIcon.Group>
                  <Tooltip label="View Tools">
                    <ActionIcon variant="light" color="blue" size="md" onClick={() => handleViewTools(server)}>
                      <IconTool />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Edit">
                    <ActionIcon variant="light" color="gray" size="md" onClick={() => handleEditServer(server)}>
                      <IconEdit />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete">
                    <ActionIcon variant="light" color="red" size="md" onClick={() => handleDeleteServer(server)}>
                      <IconTrash />
                    </ActionIcon>
                  </Tooltip>
                </ActionIcon.Group>
              </Group>
              <Group gap="xs" mt="xs">
                <Badge variant="light" color="blue" size="xs">
                  {server.tools?.length || 0} tools
                </Badge>
                <Badge variant="light" color={server.authType === "NONE" ? "gray" : "blue"} size="xs">
                  {AUTH_TYPES.find(t => t.value === server.authType)?.label || server.authType}
                </Badge>
                <Badge color={server.isActive ? "green" : "red"} size="xs">
                  {server.isActive ? "Active" : "Inactive"}
                </Badge>
              </Group>
            </Card>
          ))}
        </Flex>
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
