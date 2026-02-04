import React, { useState, useEffect, useMemo } from "react";
import {
  Paper,
  Text,
  Group,
  Stack,
  Loader,
  TextInput,
  NumberInput,
  Button,
  Alert,
  Modal,
  Textarea,
  Code,
  ScrollArea,
  Collapse,
  Accordion,
  Box,
  Divider,
} from "@mantine/core";
import { IconAlertCircle, IconTestPipe, IconTool, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { gql, useQuery, useMutation } from "@apollo/client";

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
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: string;
}

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
  const [showSchema, setShowSchema] = useState(false);

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
        <Button
          size="xs"
          variant="light"
          leftSection={<IconTestPipe size="1rem" />}
          onClick={handleTest}
          loading={testLoading}
        >
          Test
        </Button>
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

      {tool.inputSchema && (
        <Box>
          <Button
            variant="subtle"
            size="xs"
            onClick={() => setShowSchema(!showSchema)}
            rightSection={showSchema ? <IconChevronUp size="0.8rem" /> : <IconChevronDown size="0.8rem" />}
            p={0}
            h="auto"
          >
            {showSchema ? "Hide Schema" : "Show Schema"}
          </Button>
          <Collapse in={showSchema}>
            <ScrollArea h={120} mt="xs">
              <Code block style={{ fontSize: "0.7rem" }}>
                {JSON.stringify(JSON.parse(tool.inputSchema), null, 2)}
              </Code>
            </ScrollArea>
          </Collapse>
        </Box>
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
}

export const MCPToolsDialog: React.FC<MCPToolsDialogProps> = ({ opened, onClose, server }) => {
  const { data: toolsData, loading: toolsLoading } = useQuery(GET_MCP_SERVER_TOOLS, {
    variables: { serverId: server?.id || "" },
    skip: !server?.id || !opened,
    errorPolicy: "all",
  });

  const tools: MCPTool[] = toolsData?.getMCPServerTools?.tools || [];

  return (
    <Modal opened={opened} onClose={onClose} title={`Tools - ${server?.name || ""}`} size="lg">
      {toolsLoading ? (
        <Group justify="center" p="xl">
          <Loader />
        </Group>
      ) : toolsData?.getMCPServerTools?.error ? (
        <Alert icon={<IconAlertCircle size="1rem" />} color="red">
          {toolsData.getMCPServerTools.error}
        </Alert>
      ) : !tools.length ? (
        <Text c="dimmed" ta="center" p="xl">
          No tools available from this server
        </Text>
      ) : (
        <ScrollArea h={500}>
          <Stack gap="md">
            {tools.map((tool: MCPTool) => (
              <ToolCard key={tool.name} tool={tool} serverId={server!.id} />
            ))}
          </Stack>
        </ScrollArea>
      )}
    </Modal>
  );
};
