import React, { useState, useEffect } from "react";
import { Stack, TextInput, Button, Group, Modal, Textarea, Select } from "@mantine/core";
import { gql, useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";

const CREATE_MCP_SERVER = gql`
  mutation CreateMCPServer($input: CreateMCPServerInput!) {
    createMCPServer(input: $input) {
      server {
        id
        name
        url
        description
        transportType
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
        transportType
        authType
        isActive
      }
      error
    }
  }
`;

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  description?: string;
  transportType: string;
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

interface FormData {
  name: string;
  url: string;
  description: string;
  transportType: string;
  authType: string;
  apiKey: string;
  headerName: string;
  bearerToken: string;
}

const AUTH_TYPES = [
  { value: "NONE", label: "No Authentication" },
  { value: "API_KEY", label: "API Key" },
  { value: "BEARER", label: "Bearer Token" },
];

const TRANSPORT_TYPES = [
  { value: "STREAMABLE_HTTP", label: "Streamable HTTP (Modern)" },
  { value: "HTTP_SSE_LEGACY", label: "HTTP + SSE (Legacy)" },
];

const DEFAULT_FORM_DATA: FormData = {
  name: "",
  url: "",
  description: "",
  transportType: "STREAMABLE_HTTP",
  authType: "NONE",
  apiKey: "",
  headerName: "",
  bearerToken: "",
};

interface MCPServerFormDialogProps {
  opened: boolean;
  onClose: () => void;
  server?: MCPServer | null; // If provided, it's edit mode
  onSuccess: () => void;
}

export const MCPServerFormDialog: React.FC<MCPServerFormDialogProps> = ({ opened, onClose, server, onSuccess }) => {
  const isEditMode = !!server;
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);

  // Reset form when dialog opens/closes or server changes
  useEffect(() => {
    if (opened) {
      if (server) {
        setFormData({
          name: server.name,
          url: server.url,
          description: server.description || "",
          transportType: server.transportType || "STREAMABLE_HTTP",
          authType: server.authType,
          apiKey: "",
          headerName: server.authConfig?.headerName || "",
          bearerToken: "",
        });
      } else {
        setFormData(DEFAULT_FORM_DATA);
      }
    }
  }, [opened, server]);

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
        onSuccess();
        onClose();
      }
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
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
        onSuccess();
        onClose();
      }
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  const handleSubmit = () => {
    const authConfig: Record<string, string> = {};
    if (formData.authType === "API_KEY") {
      if (formData.apiKey) authConfig.apiKey = formData.apiKey;
      authConfig.headerName = formData.headerName || "X-API-Key";
    } else if (formData.authType === "BEARER") {
      if (formData.bearerToken) authConfig.bearerToken = formData.bearerToken;
    }

    const input = {
      name: formData.name,
      url: formData.url,
      description: formData.description || undefined,
      transportType: formData.transportType,
      authType: formData.authType,
      authConfig: Object.keys(authConfig).length > 0 ? authConfig : undefined,
    };

    if (isEditMode && server) {
      updateServer({
        variables: {
          input: { id: server.id, ...input },
        },
      });
    } else {
      createServer({
        variables: { input },
      });
    }
  };

  const loading = createLoading || updateLoading;

  return (
    <Modal opened={opened} onClose={onClose} title={isEditMode ? "Edit MCP Server" : "Add MCP Server"} size="lg">
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
          label="Transport Type"
          description="Use Legacy for servers that use the older SSE protocol"
          data={TRANSPORT_TYPES}
          value={formData.transportType}
          onChange={v => setFormData({ ...formData, transportType: v || "STREAMABLE_HTTP" })}
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
              placeholder={isEditMode ? "Leave blank to keep existing" : "Your API key"}
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
            placeholder={isEditMode ? "Leave blank to keep existing" : "Your bearer token"}
            type="password"
            value={formData.bearerToken}
            onChange={e => setFormData({ ...formData, bearerToken: e.target.value })}
          />
        )}
        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            {isEditMode ? "Update Server" : "Add Server"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
