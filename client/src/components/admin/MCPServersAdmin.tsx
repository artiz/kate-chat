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
  Code,
  ScrollArea,
} from "@mantine/core";
import {
  IconPlus,
  IconRefresh,
  IconAlertCircle,
  IconTrash,
  IconEdit,
  IconPlugConnected,
  IconTestPipe,
  IconTool,
} from "@tabler/icons-react";
import { gql, useQuery, useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";

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

const GET_MCP_SERVER_TOOLS = gql`
  query GetMCPServerTools($serverId: String!) {
    getMCPServerTools(serverId: $serverId) {
      tools {
        name
        description
        inputSchema
      }
      error
    }
  }
`;

const TEST_MCP_TOOL = gql`
  mutation TestMCPTool($input: TestMCPToolInput!) {
    testMCPTool(input: $input) {
      result
      error
    }
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

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: string;
}

const AUTH_TYPES = [
  { value: "none", label: "No Authentication" },
  { value: "api_key", label: "API Key" },
  { value: "bearer", label: "Bearer Token" },
];

export const MCPServersAdmin: React.FC = () => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<MCPServer | null>(null);
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null);
  const [testArgs, setTestArgs] = useState("{}");
  const [testResult, setTestResult] = useState<string | null>(null);

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

  const {
    data: toolsData,
    loading: toolsLoading,
    refetch: refetchTools,
  } = useQuery(GET_MCP_SERVER_TOOLS, {
    variables: { serverId: selectedServer?.id || "" },
    skip: !selectedServer?.id || !isToolsModalOpen,
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

  const [testTool, { loading: testLoading }] = useMutation(TEST_MCP_TOOL, {
    onCompleted: data => {
      if (data.testMCPTool.error) {
        setTestResult(`Error: ${data.testMCPTool.error}`);
      } else {
        setTestResult(data.testMCPTool.result);
      }
    },
    onError: error => {
      setTestResult(`Error: ${error.message}`);
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
    if (formData.authType === "api_key") {
      authConfig.apiKey = formData.apiKey;
      authConfig.headerName = formData.headerName || "X-API-Key";
    } else if (formData.authType === "bearer") {
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
    if (formData.authType === "api_key") {
      authConfig.apiKey = formData.apiKey;
      authConfig.headerName = formData.headerName || "X-API-Key";
    } else if (formData.authType === "bearer") {
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

  const handleTestTool = (tool: MCPTool) => {
    setSelectedTool(tool);
    setTestArgs("{}");
    setTestResult(null);
    setIsTestModalOpen(true);
  };

  const handleRunTest = () => {
    if (!selectedServer || !selectedTool) return;

    testTool({
      variables: {
        input: {
          serverId: selectedServer.id,
          toolName: selectedTool.name,
          argsJson: testArgs,
        },
      },
    });
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
        <Title order={2}>MCP Servers</Title>
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
                  <Group gap="xs">
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
                  </Group>
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
            onChange={v => setFormData({ ...formData, authType: v || "none" })}
          />
          {formData.authType === "api_key" && (
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
          {formData.authType === "bearer" && (
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
            onChange={v => setFormData({ ...formData, authType: v || "none" })}
          />
          {formData.authType === "api_key" && (
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
          {formData.authType === "bearer" && (
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

      {/* Tools Modal */}
      <Modal
        opened={isToolsModalOpen}
        onClose={() => setIsToolsModalOpen(false)}
        title={`Tools - ${selectedServer?.name || ""}`}
        size="lg"
      >
        {toolsLoading ? (
          <Group justify="center" p="xl">
            <Loader />
          </Group>
        ) : toolsData?.getMCPServerTools?.error ? (
          <Alert icon={<IconAlertCircle size="1rem" />} color="red">
            {toolsData.getMCPServerTools.error}
          </Alert>
        ) : !toolsData?.getMCPServerTools?.tools?.length ? (
          <Text c="dimmed" ta="center" p="xl">
            No tools available from this server
          </Text>
        ) : (
          <Stack gap="md">
            {toolsData.getMCPServerTools.tools.map((tool: MCPTool) => (
              <Paper key={tool.name} withBorder p="md">
                <Group justify="space-between" mb="xs">
                  <Group>
                    <IconTool size="1.2rem" />
                    <Text fw={500}>{tool.name}</Text>
                  </Group>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconTestPipe size="1rem" />}
                    onClick={() => handleTestTool(tool)}
                  >
                    Test
                  </Button>
                </Group>
                {tool.description && (
                  <Text size="sm" c="dimmed" mb="xs">
                    {tool.description}
                  </Text>
                )}
                {tool.inputSchema && (
                  <ScrollArea h={150}>
                    <Code block style={{ fontSize: "0.75rem" }}>
                      {tool.inputSchema}
                    </Code>
                  </ScrollArea>
                )}
              </Paper>
            ))}
          </Stack>
        )}
      </Modal>

      {/* Test Tool Modal */}
      <Modal
        opened={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        title={`Test Tool - ${selectedTool?.name || ""}`}
        size="lg"
      >
        <Stack gap="md">
          {selectedTool?.description && (
            <Text size="sm" c="dimmed">
              {selectedTool.description}
            </Text>
          )}
          <Textarea
            label="Arguments (JSON)"
            placeholder="{}"
            minRows={5}
            value={testArgs}
            onChange={e => setTestArgs(e.target.value)}
            styles={{ input: { fontFamily: "monospace" } }}
          />
          <Button onClick={handleRunTest} loading={testLoading} leftSection={<IconTestPipe size="1rem" />}>
            Run Test
          </Button>
          {testResult && (
            <>
              <Text fw={500}>Result:</Text>
              <ScrollArea h={200}>
                <Code block style={{ whiteSpace: "pre-wrap" }}>
                  {testResult}
                </Code>
              </ScrollArea>
            </>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
};
