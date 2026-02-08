import React, { useState, useEffect, useMemo } from "react";
import {
  Paper,
  Text,
  Group,
  Stack,
  TextInput,
  NumberInput,
  Button,
  Modal,
  Textarea,
  Code,
  ScrollArea,
  Collapse,
  Box,
  Divider,
  Select,
} from "@mantine/core";
import { IconTestPipe, IconTool, IconChevronDown, IconChevronUp, IconRefresh, IconLock } from "@tabler/icons-react";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import {
  useMcpAuth,
  requiresAuth,
  McpTokenModal,
  getMcpAuthToken,
  MCPAuthType,
} from "@/components/auth/McpAuthentication";
import { REFETCH_MCP_SERVER_TOOLS, TEST_MCP_TOOL } from "@/store/services/graphql.queries";
import { MCPServer, MCPTool } from "@/types/graphql";

interface SchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  default?: any;
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
}

interface ParsedSchema {
  type: string;
  properties: Record<string, SchemaProperty>;
  required: string[];
}

interface ToolCardProps {
  tool: MCPTool;
  serverId: string;
}

/**
 * Parse the input schema JSON string into a structured object
 */
function parseSchema(schemaStr?: string): ParsedSchema | null {
  if (!schemaStr) return null;
  try {
    const schema = JSON.parse(schemaStr);
    return {
      type: schema.type || "object",
      properties: schema.properties || {},
      required: schema.required || [],
    };
  } catch {
    return null;
  }
}

/**
 * Check if a schema property is a simple type (string, number, boolean)
 */
function isSimpleType(prop: SchemaProperty): boolean {
  return prop.type === "string" || prop.type === "number" || prop.type === "integer" || prop.type === "boolean";
}

/**
 * Individual tool card with form controls
 */
const ToolCard: React.FC<ToolCardProps> = ({ tool, serverId }) => {
  const parsedSchema = useMemo(() => parseSchema(tool.inputSchema), [tool.inputSchema]);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [complexValues, setComplexValues] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<string | null>(null);
  const [showInputSchema, setShowInputSchema] = useState(false);
  const [showOutputSchema, setShowOutputSchema] = useState(false);

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

  // Initialize form values from schema defaults
  useEffect(() => {
    if (parsedSchema?.properties) {
      const initialValues: Record<string, any> = {};
      const initialComplex: Record<string, string> = {};

      Object.entries(parsedSchema.properties).forEach(([key, prop]) => {
        if (prop.default !== undefined) {
          if (isSimpleType(prop)) {
            initialValues[key] = prop.default;
          } else {
            initialComplex[key] = JSON.stringify(prop.default, null, 2);
          }
        } else if (!isSimpleType(prop)) {
          // Initialize complex types with empty structure
          if (prop.type === "array") {
            initialComplex[key] = "[]";
          } else if (prop.type === "object") {
            initialComplex[key] = "{}";
          }
        }
      });

      setFormValues(initialValues);
      setComplexValues(initialComplex);
    }
  }, [parsedSchema]);

  const handleTest = () => {
    // Build arguments from form values
    const args: Record<string, any> = { ...formValues };

    // Parse complex values
    Object.entries(complexValues).forEach(([key, value]) => {
      if (value.trim()) {
        try {
          args[key] = JSON.parse(value);
        } catch {
          // Keep as string if not valid JSON
          args[key] = value;
        }
      }
    });

    // Remove empty/undefined values
    Object.keys(args).forEach(key => {
      if (args[key] === undefined || args[key] === "") {
        delete args[key];
      }
    });

    testTool({
      variables: {
        input: {
          serverId,
          toolName: tool.name,
          argsJson: JSON.stringify(args),
          authToken: getMcpAuthToken(serverId)?.accessToken,
        },
      },
    });
  };

  const handleSimpleValueChange = (key: string, value: any) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
  };

  const handleComplexValueChange = (key: string, value: string) => {
    setComplexValues(prev => ({ ...prev, [key]: value }));
  };

  const renderPropertyInput = (key: string, prop: SchemaProperty, isRequired: boolean) => {
    const label = `${key}${isRequired ? " *" : ""}`;
    const description = prop.description;

    // String type
    if (prop.type === "string") {
      // If has enum, could use Select - but for simplicity use TextInput
      if (prop.enum && prop.enum.length > 0) {
        return (
          <TextInput
            key={key}
            label={label}
            description={description}
            placeholder={`Options: ${prop.enum.join(", ")}`}
            value={formValues[key] || ""}
            onChange={e => handleSimpleValueChange(key, e.target.value)}
            size="xs"
          />
        );
      }
      return (
        <TextInput
          key={key}
          label={label}
          description={description}
          placeholder={`Enter ${key}`}
          value={formValues[key] || ""}
          onChange={e => handleSimpleValueChange(key, e.target.value)}
          size="xs"
        />
      );
    }

    // Number/Integer type
    if (prop.type === "number" || prop.type === "integer") {
      return (
        <NumberInput
          key={key}
          label={label}
          description={description}
          placeholder={`Enter ${key}`}
          value={formValues[key] ?? ""}
          onChange={value => handleSimpleValueChange(key, value)}
          size="xs"
          allowDecimal={prop.type === "number"}
        />
      );
    }

    // Boolean type - use TextInput with true/false for simplicity
    if (prop.type === "boolean") {
      return (
        <TextInput
          key={key}
          label={label}
          description={`${description || ""} (true/false)`}
          placeholder="true or false"
          value={formValues[key]?.toString() || ""}
          onChange={e => {
            const val = e.target.value.toLowerCase();
            if (val === "true") handleSimpleValueChange(key, true);
            else if (val === "false") handleSimpleValueChange(key, false);
            else handleSimpleValueChange(key, e.target.value);
          }}
          size="xs"
        />
      );
    }

    // Complex types (array, object, etc.) - use Textarea for JSON
    return (
      <Textarea
        key={key}
        label={label}
        description={`${description || ""} (JSON format)`}
        placeholder={prop.type === "array" ? "[]" : "{}"}
        value={complexValues[key] || ""}
        onChange={e => handleComplexValueChange(key, e.target.value)}
        size="xs"
        minRows={2}
        styles={{ input: { fontFamily: "monospace", fontSize: "0.75rem" } }}
      />
    );
  };

  const hasParameters = parsedSchema && Object.keys(parsedSchema.properties).length > 0;

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="xs">
        <Group>
          <IconTool size="1.2rem" />
          <Text fw={500}>{tool.name}</Text>
        </Group>
      </Group>

      {tool.description && (
        <Text size="sm" c="dimmed" mb="sm">
          {tool.description}
        </Text>
      )}

      {hasParameters && (
        <Stack gap="xs" mb="sm">
          <Text size="xs" fw={500} c="dimmed">
            Parameters:
          </Text>
          {Object.entries(parsedSchema!.properties).map(([key, prop]) =>
            renderPropertyInput(key, prop, parsedSchema!.required.includes(key))
          )}
        </Stack>
      )}

      {!hasParameters && tool.inputSchema && (
        <Text size="xs" c="dimmed" mb="sm">
          No parameters required
        </Text>
      )}

      <Button
        size="xs"
        variant="light"
        leftSection={<IconTestPipe size="1rem" />}
        onClick={handleTest}
        loading={testLoading}
      >
        Test
      </Button>

      <Group gap="md" mt="xs">
        {tool.inputSchema && (
          <Button
            variant="subtle"
            size="xs"
            onClick={() => setShowInputSchema(!showInputSchema)}
            rightSection={showInputSchema ? <IconChevronUp size="0.8rem" /> : <IconChevronDown size="0.8rem" />}
            p={0}
            h="auto"
          >
            {showInputSchema ? "Hide Input Schema" : "Show Input Schema"}
          </Button>
        )}
        {tool.outputSchema && (
          <Button
            variant="subtle"
            size="xs"
            onClick={() => setShowOutputSchema(!showOutputSchema)}
            rightSection={showOutputSchema ? <IconChevronUp size="0.8rem" /> : <IconChevronDown size="0.8rem" />}
            p={0}
            h="auto"
          >
            {showOutputSchema ? "Hide Output Schema" : "Show Output Schema"}
          </Button>
        )}
      </Group>

      {tool.inputSchema && (
        <Collapse in={showInputSchema}>
          <Box mt="xs">
            <Text size="xs" fw={500} c="dimmed" mb="xs">
              Input Schema:
            </Text>
            <ScrollArea h={120}>
              <Code block style={{ fontSize: "0.7rem" }}>
                {JSON.stringify(JSON.parse(tool.inputSchema), null, 2)}
              </Code>
            </ScrollArea>
          </Box>
        </Collapse>
      )}

      {tool.outputSchema && (
        <Collapse in={showOutputSchema}>
          <Box mt="xs">
            <Text size="xs" fw={500} c="dimmed" mb="xs">
              Output Schema:
            </Text>
            <ScrollArea h={120}>
              <Code block style={{ fontSize: "0.7rem" }}>
                {JSON.stringify(JSON.parse(tool.outputSchema), null, 2)}
              </Code>
            </ScrollArea>
          </Box>
        </Collapse>
      )}

      {testResult && (
        <Box mt="sm">
          <Divider mb="xs" />
          <Text size="xs" fw={500} mb="xs">
            Result:
          </Text>
          <ScrollArea h={150}>
            <Code block style={{ whiteSpace: "pre-wrap", fontSize: "0.75rem" }}>
              {testResult}
            </Code>
          </ScrollArea>
        </Box>
      )}
    </Paper>
  );
};

interface MCPToolsDialogProps {
  opened: boolean;
  onClose: () => void;
  server: MCPServer | null;
  onToolsRefetched?: () => void;
}

export const MCPToolsDialog: React.FC<MCPToolsDialogProps> = ({ opened, onClose, server, onToolsRefetched }) => {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);

  // MCP authentication hook
  const servers = useMemo(() => (server ? [server] : []), [server]);

  // Selected tool
  const selectedTool = useMemo(() => tools.find(t => t.name === selectedToolName) || null, [tools, selectedToolName]);

  // Tool options for select
  const toolOptions = useMemo(
    () => tools.map(t => ({ value: t.name, label: t.name, description: t.description })),
    [tools]
  );
  const {
    mcpSubmitToken,
    mcpTokenModalServer,
    mcpInitiateAuth,
    mcpTokenValue,
    mcpSetTokenValue,
    mcpCloseTokenModal,
    mcpAuthStatus,
  } = useMcpAuth(servers);

  // Check if auth is needed - use hook's auth status for reactivity
  const needsAuth = server && requiresAuth(server) && !mcpAuthStatus.get(server.id);

  const [refetchTools, { loading: refetchLoading }] = useMutation(REFETCH_MCP_SERVER_TOOLS, {
    onCompleted: data => {
      if (data.refetchMcpServerTools.error) {
        notifications.show({
          title: "Error",
          message: data.refetchMcpServerTools.error,
          color: "red",
        });
      } else {
        notifications.show({
          title: "Success",
          message: "Tools refreshed successfully",
          color: "green",
        });

        onToolsRefetched?.();
        setTools(data.refetchMcpServerTools.server.tools);
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

  useEffect(() => {
    if (server) {
      setTools(server.tools || []);
      // Auto-select first tool if available
      if (server.tools?.length && !selectedToolName) {
        setSelectedToolName(server.tools[0].name);
      }
    }
  }, [server]);

  // Reset selection when dialog closes
  useEffect(() => {
    if (!opened) {
      setSelectedToolName(null);
    }
  }, [opened]);

  const handleRefetchTools = () => {
    if (server?.id) {
      setTools([]);
      refetchTools({ variables: { serverId: server.id, authToken: getMcpAuthToken(server.id)?.accessToken } });
    }
  };

  const handleAuthenticate = () => {
    if (server) {
      mcpInitiateAuth(server);
    }
  };

  const handleReAuthenticate = () => {
    if (server) {
      mcpInitiateAuth(server, true);
    }
  };

  const handleTokenSubmit = () => {
    mcpSubmitToken();
  };

  if (!server) return null;

  return (
    <>
      <Modal opened={opened} onClose={onClose} title={`Tools - ${server?.name || ""}`} size="lg">
        {needsAuth ? (
          <Stack align="center" p="xl" gap="md">
            <IconLock size="3rem" color="orange" />
            <Text ta="center" size="lg" fw={500}>
              Authentication Required
            </Text>
            <Text ta="center" c="dimmed" size="sm">
              This MCP server requires authentication before you can view or test its tools.
            </Text>
            <Button leftSection={<IconLock size="1rem" />} onClick={handleAuthenticate}>
              Authenticate
            </Button>
          </Stack>
        ) : (
          <>
            <Group justify="space-between" mb="md">
              <Group>
                <Text size="sm" c="dimmed">
                  {tools.length} tool{tools.length !== 1 ? "s" : ""} available
                </Text>
              </Group>
              <Group>
                {server.authType === MCPAuthType.OAUTH2 ? (
                  <Button leftSection={<IconLock size="1rem" />} onClick={handleReAuthenticate}>
                    Re-Authenticate
                  </Button>
                ) : null}
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconRefresh size="1rem" />}
                  onClick={handleRefetchTools}
                  loading={refetchLoading}
                >
                  Refetch tools
                </Button>
              </Group>
            </Group>
            {!tools.length ? (
              <Text c="dimmed" ta="center" p="xl">
                No tools available from this server
              </Text>
            ) : (
              <Stack gap="md">
                <Select
                  placeholder="Select a tool to test"
                  searchable
                  data={toolOptions}
                  value={selectedToolName}
                  onChange={setSelectedToolName}
                  leftSection={<IconTool size="1rem" />}
                  renderOption={({ option }) => {
                    const toolDesc = tools.find(t => t.name === option.value)?.description;
                    return (
                      <Stack gap={0}>
                        <Text size="sm">{option.value}</Text>
                        {toolDesc && (
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {toolDesc}
                          </Text>
                        )}
                      </Stack>
                    );
                  }}
                />

                {selectedTool && (
                  <ScrollArea h={450}>
                    <ToolCard tool={selectedTool} serverId={server!.id} />
                  </ScrollArea>
                )}
              </Stack>
            )}
          </>
        )}
      </Modal>

      {/* Token Entry Modal */}
      <McpTokenModal
        opened={!!mcpTokenModalServer}
        server={mcpTokenModalServer}
        tokenValue={mcpTokenValue}
        onTokenChange={mcpSetTokenValue}
        onSubmit={handleTokenSubmit}
        onClose={mcpCloseTokenModal}
      />
    </>
  );
};
