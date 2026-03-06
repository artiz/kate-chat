import React, { useState, useEffect, useMemo } from "react";
import { Stack, TextInput, Button, Group, Modal, Textarea, Select, Text, Divider } from "@mantine/core";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { t as translate } from "i18next";
import { CREATE_MCP_SERVER, UPDATE_MCP_SERVER } from "@/store/services/graphql.queries";
import { EntityAccessType, MCPServer } from "@/types/graphql";
import { useAppSelector } from "@/store";
import { UserRole } from "@/store/slices/userSlice";

interface FormData {
  name: string;
  url: string;
  description: string;
  transportType: string;
  authType: string;
  headerName: string;
  access: EntityAccessType;
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
  access: EntityAccessType.PRIVATE,
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

const AUTH_TYPES = [
  { value: "NONE", label: translate("mcp.noAuth") },
  { value: "API_KEY", label: translate("mcp.apiKeyAuth") },
  { value: "BEARER", label: translate("mcp.bearerTokenAuth") },
  { value: "OAUTH2", label: translate("mcp.oauth2") },
];

const TRANSPORT_TYPES = [
  { value: "STREAMABLE_HTTP", label: translate("mcp.streamableHttp") },
  { value: "HTTP_SSE_LEGACY", label: translate("mcp.httpSse") },
];

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
  const { currentUser } = useAppSelector(state => state.user);

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
          access: server.access || EntityAccessType.PRIVATE,
          headerName: server.authConfig?.headerName || "",
          clientId: server.authConfig?.clientId || "",
          clientSecret: server.authConfig?.clientSecret || "",
          tokenUrl: server.authConfig?.tokenUrl || "",
          authorizationUrl: server.authConfig?.authorizationUrl || "",
          scope: server.authConfig?.scope || "",
        });
      } else {
        setFormData(DEFAULT_FORM_DATA);
      }
    }
  }, [opened, server]);

  const accessTypes = useMemo(() => {
    const types = [
      { value: EntityAccessType.PRIVATE, label: t("common.access.private") },
      { value: EntityAccessType.SHARED, label: t("common.access.shared") },
    ];
    if (currentUser?.role === UserRole.ADMIN) {
      types.push({ value: EntityAccessType.SYSTEM, label: t("common.access.system") });
    }

    return types;
  }, [currentUser]);

  const isEditable = useMemo(() => {
    if (!server) return true;
    return (
      currentUser &&
      (server.userId === currentUser.id ||
        (currentUser.role === UserRole.ADMIN && server.access === EntityAccessType.SYSTEM))
    );
  }, [server, currentUser, isEditMode]);

  const [createServer, { loading: createLoading }] = useMutation(CREATE_MCP_SERVER, {
    onCompleted: data => {
      if (data.createMcpServer.error) {
        notifications.show({
          title: t("common.error"),
          message: data.createMcpServer.error,
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
      if (data.updateMcpServer.error) {
        notifications.show({
          title: t("common.error"),
          message: data.updateMcpServer.error,
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
      if (formData.clientId != server?.authConfig?.clientId) authConfig.clientId = formData.clientId;
      if (formData.clientSecret != server?.authConfig?.clientSecret) authConfig.clientSecret = formData.clientSecret;
      authConfig.tokenUrl = formData.tokenUrl;
      authConfig.authorizationUrl = formData.authorizationUrl;
      authConfig.scope = formData.scope;
    }

    const input = {
      name: formData.name,
      url: formData.url,
      description: formData.description || undefined,
      transportType: formData.transportType,
      authType: formData.authType,
      authConfig: Object.keys(authConfig).length > 0 ? authConfig : undefined,
      access: formData.access,
    };

    if (isEditMode && isEditable && server) {
      updateServer({
        variables: {
          input: { id: server.id, ...input },
        },
      });
    } else {
      if (!isEditable) {
        input.access = EntityAccessType.PRIVATE; // Force private access for clones of non-editable servers
      }
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
          readOnly={!isEditable}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
        />
        <TextInput
          label={t("mcp.url")}
          placeholder={t("mcp.urlPlaceholder")}
          required
          value={formData.url}
          readOnly={!isEditable}
          onChange={e => setFormData({ ...formData, url: e.target.value })}
        />
        <Textarea
          label={t("common.description")}
          placeholder={t("mcp.descriptionPlaceholder")}
          value={formData.description}
          readOnly={!isEditable}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
        />
        <Select
          flex="1"
          label={t("mcp.transportType")}
          description={t("mcp.transportTypeDescription")}
          data={TRANSPORT_TYPES}
          value={formData.transportType}
          readOnly={!isEditable}
          onChange={v => setFormData({ ...formData, transportType: v || "STREAMABLE_HTTP" })}
        />
        <Group justify="space-evenly" align="stretch">
          <Select
            flex="1"
            label={t("mcp.authType")}
            description={t("mcp.authTypeDescription")}
            data={AUTH_TYPES}
            value={formData.authType}
            readOnly={!isEditable}
            onChange={v => setFormData({ ...formData, authType: v || "NONE" })}
          />

          {isEditable && (
            <Select
              flex="1"
              label={t("mcp.access")}
              description={t("mcp.accessDescription")}
              data={accessTypes}
              value={formData.access}
              onChange={v => setFormData({ ...formData, access: (v as EntityAccessType) || EntityAccessType.PRIVATE })}
            />
          )}
        </Group>
        <Divider />
        {formData.authType === "API_KEY" && (
          <>
            <TextInput
              label={t("mcp.headerName")}
              placeholder="X-API-Key"
              value={formData.headerName}
              readOnly={!isEditable}
              onChange={e => setFormData({ ...formData, headerName: e.target.value })}
            />
          </>
        )}
        {formData.authType === "OAUTH2" && (
          <>
            <Text size="sm" c="dimmed" mb="xs">
              {t("mcp.oauthInfo")}
            </Text>
            <Group justify="space-evenly" align="stretch">
              <TextInput
                flex="1"
                label={t("mcp.clientId")}
                placeholder={t("mcp.clientIdPlaceholder")}
                required
                value={formData.clientId}
                readOnly={!isEditable}
                onChange={e => setFormData({ ...formData, clientId: e.target.value })}
              />
              <TextInput
                flex="1"
                label={t("mcp.clientSecret")}
                placeholder={t("mcp.clientSecretPlaceholder")}
                value={formData.clientSecret}
                readOnly={!isEditable}
                onChange={e => setFormData({ ...formData, clientSecret: e.target.value })}
              />
            </Group>
            <TextInput
              label={t("mcp.authorizationUrl")}
              placeholder="https://provider.com/oauth/authorize"
              required
              value={formData.authorizationUrl}
              readOnly={!isEditable}
              onChange={e => setFormData({ ...formData, authorizationUrl: e.target.value })}
            />
            <TextInput
              label={t("mcp.tokenUrl")}
              placeholder="https://provider.com/oauth/token"
              required
              value={formData.tokenUrl}
              readOnly={!isEditable}
              onChange={e => setFormData({ ...formData, tokenUrl: e.target.value })}
            />
            <TextInput
              label={t("mcp.scope")}
              placeholder={t("mcp.scopePlaceholder")}
              value={formData.scope}
              readOnly={!isEditable}
              onChange={e => setFormData({ ...formData, scope: e.target.value })}
            />
          </>
        )}
        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={onClose}>
            {isEditable ? t("common.cancel") : t("common.close")}
          </Button>
          {isEditable ? (
            <Button onClick={handleSubmit} loading={loading}>
              {isEditMode ? t("mcp.updateServer") : t("mcp.addServer")}
            </Button>
          ) : (
            <Button onClick={handleSubmit} loading={loading}>
              {t("common.clone")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
};
