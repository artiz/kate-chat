import React, { useState, useEffect } from "react";
import { Stack, TextInput, Button, Group, Modal, Textarea, Select, Text } from "@mantine/core";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
          title: t("common.error"),
          message: data.createMCPServer.error,
          color: "red",
        });
      } else {
        notifications.show({
          title: t("common.success"),
          message: t("mcp.serverCreated"),
          color: "green",
        });
        onSuccess();
        onClose();
      }
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message,
        color: "red",
      });
    },
  });

  const [updateServer, { loading: updateLoading }] = useMutation(UPDATE_MCP_SERVER, {
    onCompleted: data => {
      if (data.updateMCPServer.error) {
        notifications.show({
          title: t("common.error"),
          message: data.updateMCPServer.error,
          color: "red",
        });
      } else {
        notifications.show({
          title: t("common.success"),
          message: t("mcp.serverUpdated"),
          color: "green",
        });
        onSuccess();
        onClose();
      }
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
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

  const AUTH_TYPES = [
    { value: "NONE", label: t("mcp.noAuth") },
    { value: "API_KEY", label: t("mcp.apiKeyAuth") },
    { value: "BEARER", label: t("mcp.bearerTokenAuth") },
    { value: "OAUTH2", label: t("mcp.oauth2") },
  ];

  const TRANSPORT_TYPES = [
    { value: "STREAMABLE_HTTP", label: t("mcp.streamableHttp") },
    { value: "HTTP_SSE_LEGACY", label: t("mcp.httpSse") },
  ];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEditMode ? t("mcp.editMcpServer") : t("mcp.addMcpServer")}
      size="lg"
      fullScreen={fullScreen}
    >
      <Stack gap="md">
        <TextInput
          label={t("mcp.serverName")}
          placeholder={t("mcp.serverNamePlaceholder")}
          required
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
        />
        <TextInput
          label={t("mcp.url")}
          placeholder={t("mcp.urlPlaceholder")}
          required
          value={formData.url}
          onChange={e => setFormData({ ...formData, url: e.target.value })}
        />
        <Textarea
          label={t("common.description")}
          placeholder={t("mcp.descriptionPlaceholder")}
          value={formData.description}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
        />
        <Select
          label={t("mcp.transportType")}
          description={t("mcp.transportTypeDescription")}
          data={TRANSPORT_TYPES}
          value={formData.transportType}
          onChange={v => setFormData({ ...formData, transportType: v || "STREAMABLE_HTTP" })}
        />
        <Select
          label={t("mcp.authType")}
          data={AUTH_TYPES}
          value={formData.authType}
          onChange={v => setFormData({ ...formData, authType: v || "NONE" })}
        />
        {formData.authType === "API_KEY" && (
          <>
            <TextInput
              label={t("mcp.headerName")}
              placeholder="X-API-Key"
              value={formData.headerName}
              onChange={e => setFormData({ ...formData, headerName: e.target.value })}
            />
          </>
        )}
        {formData.authType === "OAUTH2" && (
          <>
            <Text size="sm" c="dimmed" mb="xs">
              {t("mcp.oauthInfo")}
            </Text>
            <TextInput
              label={t("mcp.clientId")}
              placeholder={t("mcp.clientIdPlaceholder")}
              required
              value={formData.clientId}
              onChange={e => setFormData({ ...formData, clientId: e.target.value })}
            />
            <TextInput
              label={t("mcp.clientSecret")}
              placeholder={isEditMode ? t("mcp.clientSecretPlaceholderEdit") : t("mcp.clientSecretPlaceholder")}
              type="password"
              value={formData.clientSecret}
              onChange={e => setFormData({ ...formData, clientSecret: e.target.value })}
            />
            <TextInput
              label={t("mcp.authorizationUrl")}
              placeholder="https://provider.com/oauth/authorize"
              required
              value={formData.authorizationUrl}
              onChange={e => setFormData({ ...formData, authorizationUrl: e.target.value })}
            />
            <TextInput
              label={t("mcp.tokenUrl")}
              placeholder="https://provider.com/oauth/token"
              required
              value={formData.tokenUrl}
              onChange={e => setFormData({ ...formData, tokenUrl: e.target.value })}
            />
            <TextInput
              label={t("mcp.scope")}
              placeholder={t("mcp.scopePlaceholder")}
              value={formData.scope}
              onChange={e => setFormData({ ...formData, scope: e.target.value })}
            />
          </>
        )}
        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            {isEditMode ? t("mcp.updateServer") : t("mcp.addServer")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
