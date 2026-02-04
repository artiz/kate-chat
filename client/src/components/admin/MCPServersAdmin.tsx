import React, { useState } from "react";
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
  Modal,
  Textarea,
  Select,
  Switch,
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
import { MCPToolsDialog } from "./MCPToolsDialog";

// GraphQL queries and mutations
const GET_MCP_SERVERS = gql`
  query GetMCPServers {
    getMCPServers {
      servers {
        id
        name
        url
        description
        authType
        authConfig {
          apiKey
          headerName
          bearerToken
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

const CREATE_MCP_SERVER = gql`
  mutation CreateMCPServer($input: CreateMCPServerInput!) {
    createMCPServer(input: $input) {
      server {
        id
        name
        url
        description
        authType
        isActive
      }
      error
    }
  }
`;

const UPDATE_MCP_SERVER = gql`
  mutation UpdateMCPServer($input: UpdateMCPServerInput!) {
    updateMCPServer(input: $input) {
      server {
        id
        name
        url
        description
        authType
        isActive
      }
      error
    }
  }
`;

const DELETE_MCP_SERVER = gql`
  mutation DeleteMCPServer($input: DeleteMCPServerInput!) {
    deleteMCPServer(input: $input)
  }
`;

interface MCPServer {
  id: string;
  name: string;
  url: string;
  description?: string;
  authType: string;
  authConfig?: {
    apiKey?: string;
    headerName?: string;
    bearerToken?: string;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const AUTH_TYPES = [
  { value: "NONE", label: "No Authentication" },
  { value: "API_KEY", label: "API Key" },
  { value: "BEARER", label: "Bearer Token" },
];

export const MCPServersAdmin: React.FC = () => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<MCPServer | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    description: "",
    authType: "none",
    apiKey: "",
    headerName: "",
    bearerToken: "",
  });

  // Queries
  const {
    data: serversData,
    loading: serversLoading,
    error: serversError,
    refetch: refetchServers,
  } = useQuery(GET_MCP_SERVERS, {
    errorPolicy: "all",
  });

  // Mutations
  const [createServer, { loading: createLoading }] = useMutation(CREATE_MCP_SERVER, {
    onCompleted: data => {
      if (data.createMCPServer.error) {
        notifications.show({
          title: "Error",
          message: data.createMCPServer.error,
          color: "red",
        });
      } else {
        notifications.show({
          title: "Success",
          message: "MCP server created successfully",
          color: "green",
        });
        setIsAddModalOpen(false);
        refetchServers();
        resetForm();
      }
    },
  });

  const [updateServer, { loading: updateLoading }] = useMutation(UPDATE_MCP_SERVER, {
    onCompleted: data => {
      if (data.updateMCPServer.error) {
        notifications.show({
          title: "Error",
          message: data.updateMCPServer.error,
          color: "red",
        });
      } else {
        notifications.show({
          title: "Success",
          message: "MCP server updated successfully",
          color: "green",
        });
        setIsEditModalOpen(false);
        refetchServers();
        resetForm();
      }
    },
  });

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

  const resetForm = () => {
    setFormData({
      name: "",
      url: "",
      description: "",
      authType: "none",
      apiKey: "",
      headerName: "",
      bearerToken: "",
    });
  };

  const handleAddServer = () => {
    const authConfig: Record<string, string> = {};
    if (formData.authType === "API_KEY") {
      authConfig.apiKey = formData.apiKey;
      authConfig.headerName = formData.headerName || "X-API-Key";
    } else if (formData.authType === "BEARER") {
      authConfig.bearerToken = formData.bearerToken;
    }

    createServer({
      variables: {
        input: {
          name: formData.name,
          url: formData.url,
          description: formData.description || undefined,
          authType: formData.authType,
          authConfig: Object.keys(authConfig).length > 0 ? authConfig : undefined,
        },
      },
    });
  };

  const handleUpdateServer = () => {
    if (!selectedServer) return;

    const authConfig: Record<string, string> = {};
    if (formData.authType === "API_KEY") {
      authConfig.apiKey = formData.apiKey;
      authConfig.headerName = formData.headerName || "X-API-Key";
    } else if (formData.authType === "BEARER") {
      authConfig.bearerToken = formData.bearerToken;
    }

    updateServer({
      variables: {
        input: {
          id: selectedServer.id,
          name: formData.name,
          url: formData.url,
          description: formData.description || undefined,
          authType: formData.authType,
          authConfig: Object.keys(authConfig).length > 0 ? authConfig : undefined,
        },
      },
    });
  };

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
    setFormData({
      name: server.name,
      url: server.url,
      description: server.description || "",
      authType: server.authType,
      apiKey: "",
      headerName: server.authConfig?.headerName || "",
      bearerToken: "",
    });
    setIsEditModalOpen(true);
  };

  const handleViewTools = (server: MCPServer) => {
    setSelectedServer(server);
    setIsToolsModalOpen(true);
  };

  const servers: MCPServer[] = serversData?.getMCPServers?.servers || [];

  if (serversError) {
    return (
      <Alert icon={<IconAlertCircle size="1rem" />} title="Error" color="red" variant="light">
        Failed to load MCP servers: {serversError.message}
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
          <Button leftSection={<IconPlus size="1rem" />} onClick={() => setIsAddModalOpen(true)}>
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
          <Button mt="md" leftSection={<IconPlus size="1rem" />} onClick={() => setIsAddModalOpen(true)}>
            Add Your First Server
          </Button>
        </Paper>
      ) : (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>URL</Table.Th>
              <Table.Th>Auth</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {servers.map(server => (
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
                  <Badge variant="light" color={server.authType === "none" ? "gray" : "blue"}>
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

      {/* Add Server Modal */}
      <Modal opened={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add MCP Server" size="lg">
        <Stack gap="md">
          <TextInput
            label="Name"
            placeholder="My MCP Server"
            required
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
          />
          <TextInput
            label="URL"
            placeholder="https://example.com/mcp"
            required
            value={formData.url}
            onChange={e => setFormData({ ...formData, url: e.target.value })}
          />
          <Textarea
            label="Description"
            placeholder="Optional description"
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
          />
          <Select
            label="Authentication Type"
            data={AUTH_TYPES}
            value={formData.authType}
            onChange={v => setFormData({ ...formData, authType: v || "NONE" })}
          />
          {formData.authType === "API_KEY" && (
            <>
              <TextInput
                label="API Key"
                placeholder="Your API key"
                type="password"
                value={formData.apiKey}
                onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
              />
              <TextInput
                label="Header Name"
                placeholder="X-API-Key"
                value={formData.headerName}
                onChange={e => setFormData({ ...formData, headerName: e.target.value })}
              />
            </>
          )}
          {formData.authType === "BEARER" && (
            <TextInput
              label="Bearer Token"
              placeholder="Your bearer token"
              type="password"
              value={formData.bearerToken}
              onChange={e => setFormData({ ...formData, bearerToken: e.target.value })}
            />
          )}
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddServer} loading={createLoading}>
              Add Server
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Edit Server Modal */}
      <Modal opened={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit MCP Server" size="lg">
        <Stack gap="md">
          <TextInput
            label="Name"
            placeholder="My MCP Server"
            required
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
          />
          <TextInput
            label="URL"
            placeholder="https://example.com/mcp"
            required
            value={formData.url}
            onChange={e => setFormData({ ...formData, url: e.target.value })}
          />
          <Textarea
            label="Description"
            placeholder="Optional description"
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
          />
          <Select
            label="Authentication Type"
            data={AUTH_TYPES}
            value={formData.authType}
            onChange={v => setFormData({ ...formData, authType: v || "NONE" })}
          />
          {formData.authType === "API_KEY" && (
            <>
              <TextInput
                label="API Key"
                placeholder="Leave blank to keep existing"
                type="password"
                value={formData.apiKey}
                onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
              />
              <TextInput
                label="Header Name"
                placeholder="X-API-Key"
                value={formData.headerName}
                onChange={e => setFormData({ ...formData, headerName: e.target.value })}
              />
            </>
          )}
          {formData.authType === "BEARER" && (
            <TextInput
              label="Bearer Token"
              placeholder="Leave blank to keep existing"
              type="password"
              value={formData.bearerToken}
              onChange={e => setFormData({ ...formData, bearerToken: e.target.value })}
            />
          )}
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateServer} loading={updateLoading}>
              Update Server
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Tools Dialog */}
      <MCPToolsDialog opened={isToolsModalOpen} onClose={() => setIsToolsModalOpen(false)} server={selectedServer} />
    </Stack>
  );
};
