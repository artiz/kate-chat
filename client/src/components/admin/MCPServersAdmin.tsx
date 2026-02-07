import React, { useState } from "react";
import { Paper, Text, Group, Stack, Badge, Table, Loader, Button, Alert, ActionIcon, Tooltip } from "@mantine/core";
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
import { MCPToolsDialog } from "./MCPToolsDialog";
import { MCPServerFormDialog, MCPServer } from "./MCPServerFormDialog";

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
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>URL</Table.Th>
              <Table.Th>Tools</Table.Th>
              <Table.Th>Auth</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {servers.map((server: any) => (
              <Table.Tr key={server.id}>
                <Table.Td>
                  <Group>
                    <IconPlugConnected size="1.2rem" />
                    <div>
                      <Text fw={500}>{server.name}</Text>
                      {server.description && (
                        <Text size="xs" c="dimmed">
                          {server.description}
                        </Text>
                      )}
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" style={{ fontFamily: "monospace" }}>
                    {server.url}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color="blue">
                    {server.tools?.length || 0} tools
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={server.authType === "NONE" ? "gray" : "blue"}>
                    {AUTH_TYPES.find(t => t.value === server.authType)?.label || server.authType}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge color={server.isActive ? "green" : "red"}>{server.isActive ? "Active" : "Inactive"}</Badge>
                </Table.Td>
                <Table.Td>
                  <ActionIcon.Group>
                    <Tooltip label="View Tools">
                      <ActionIcon variant="light" color="blue" onClick={() => handleViewTools(server)}>
                        <IconTool size="1rem" />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Edit">
                      <ActionIcon variant="light" color="gray" onClick={() => handleEditServer(server)}>
                        <IconEdit size="1rem" />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Delete">
                      <ActionIcon variant="light" color="red" onClick={() => handleDeleteServer(server)}>
                        <IconTrash size="1rem" />
                      </ActionIcon>
                    </Tooltip>
                  </ActionIcon.Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {/* Add/Edit Server Dialog */}
      <MCPServerFormDialog
        opened={isFormDialogOpen}
        onClose={handleServerDialogClose}
        server={selectedServer}
        onSuccess={refetchServers}
      />

      {/* Tools Dialog */}
      <MCPToolsDialog
        opened={isToolsModalOpen}
        onClose={() => setIsToolsModalOpen(false)}
        server={selectedServer}
        onToolsRefetched={refetchServers}
      />
    </Stack>
  );
};
