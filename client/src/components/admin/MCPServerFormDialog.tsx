import React, { useState, useEffect } from "react";
import { Stack, TextInput, Button, Group, Modal, Textarea, Select, Text } from "@mantine/core";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { CREATE_MCP_SERVER, UPDATE_MCP_SERVER } from "@/store/services/graphql.queries";
import { MCPServer } from "@/types/graphql";

interface FormData {
  name: string;
  url: string;
  description: string;
  transportType: string;
  authType: string;
  headerName: string;
  // OAuth2 fields
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  authorizationUrl: string;
  scope: string;
}

const AUTH_TYPES = [
  { value: "NONE", label: "No Authentication" },
  { value: "API_KEY", label: "API Key" },
  { value: "BEARER", label: "Bearer Token" },
  { value: "OAUTH2", label: "OAuth 2.0" },
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
  headerName: "",
  clientId: "",
  clientSecret: "",
  tokenUrl: "",
  authorizationUrl: "",
  scope: "",
};

interface MCPServerFormDialogProps {
  opened: boolean;
  onClose: () => void;
  server?: MCPServer | null; // If provided, it's edit mode
  onSuccess: () => void;
  fullScreen?: boolean;
}

export const MCPServerFormDialog: React.FC<MCPServerFormDialogProps> = ({
  opened,
  onClose,
  server,
  onSuccess,
  fullScreen,
}) => {
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
          headerName: server.authConfig?.headerName || "",
          clientId: server.authConfig?.clientId || "",
          clientSecret: "",
          tokenUrl: server.authConfig?.tokenUrl || "",
          authorizationUrl: server.authConfig?.authorizationUrl || "",
          scope: server.authConfig?.scope || "",
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
    const authConfig: Record<string, any> = {};

    if (formData.authType === "API_KEY") {
      authConfig.headerName = formData.headerName;
    } else if (formData.authType === "OAUTH2") {
      if (formData.clientId) authConfig.clientId = formData.clientId;
      if (formData.clientSecret) authConfig.clientSecret = formData.clientSecret;
      if (formData.tokenUrl) authConfig.tokenUrl = formData.tokenUrl;
      if (formData.authorizationUrl) authConfig.authorizationUrl = formData.authorizationUrl;
      if (formData.scope) authConfig.scope = formData.scope;
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
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEditMode ? "Edit MCP Server" : "Add MCP Server"}
      size="lg"
      fullScreen={fullScreen}
    >
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
              label="Header Name"
              placeholder="X-API-Key"
              value={formData.headerName}
              onChange={e => setFormData({ ...formData, headerName: e.target.value })}
            />
          </>
        )}
        {formData.authType === "OAUTH2" && (
          <>
            <Text size="sm" c="dimmed" mb="xs">
              Configure OAuth 2.0 authentication. Enable "Requires User Auth" if each user needs to authorize
              separately.
            </Text>
            <TextInput
              label="Client ID"
              placeholder="OAuth application client ID"
              required
              value={formData.clientId}
              onChange={e => setFormData({ ...formData, clientId: e.target.value })}
            />
            <TextInput
              label="Client Secret"
              placeholder={isEditMode ? "Leave blank to keep existing" : "OAuth client secret (optional for PKCE)"}
              type="password"
              value={formData.clientSecret}
              onChange={e => setFormData({ ...formData, clientSecret: e.target.value })}
            />
            <TextInput
              label="Authorization URL"
              placeholder="https://provider.com/oauth/authorize"
              required
              value={formData.authorizationUrl}
              onChange={e => setFormData({ ...formData, authorizationUrl: e.target.value })}
            />
            <TextInput
              label="Token URL"
              placeholder="https://provider.com/oauth/token"
              required
              value={formData.tokenUrl}
              onChange={e => setFormData({ ...formData, tokenUrl: e.target.value })}
            />
            <TextInput
              label="Scope"
              placeholder="read:user openid"
              value={formData.scope}
              onChange={e => setFormData({ ...formData, scope: e.target.value })}
            />
          </>
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
