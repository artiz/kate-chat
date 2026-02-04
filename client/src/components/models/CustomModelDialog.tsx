import React, { useState, useEffect } from "react";
import {
  Modal,
  TextInput,
  Select,
  Button,
  Stack,
  Group,
  Text,
  Textarea,
  Divider,
  Alert,
  Switch,
  NumberInput,
} from "@mantine/core";
import { CustomModelProtocol } from "@katechat/ui";
import { notifications } from "@mantine/notifications";
import { useMutation } from "@apollo/client";
import { TEST_CUSTOM_MODEL_MUTATION } from "@/store/services/graphql.queries";
import { IconTestPipe, IconAlertCircle, IconCheck } from "@tabler/icons-react";

interface CustomModelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CustomModelFormData) => Promise<void>;
  isLoading?: boolean;
  initialData?: CustomModelFormData | null;
  mode?: "create" | "edit";
}

export interface CustomModelFormData {
  name: string;
  modelId: string;
  description: string;
  endpoint: string;
  apiKey?: string;
  modelName: string;
  protocol: string;
  streaming: boolean;
  imageInput: boolean;
  maxInputTokens?: number;
}

export const CustomModelDialog: React.FC<CustomModelDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
  initialData,
  mode = "create",
}) => {
  const [formData, setFormData] = useState<CustomModelFormData>({
    name: "",
    modelId: "",
    description: "",
    endpoint: "",
    apiKey: "",
    modelName: "",
    protocol: CustomModelProtocol.OPENAI_CHAT_COMPLETIONS,
    streaming: true,
    imageInput: false,
    maxInputTokens: undefined,
  });

  const [testPrompt, setTestPrompt] = useState<string>();
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  const [testCustomModel, { loading: testing }] = useMutation(TEST_CUSTOM_MODEL_MUTATION, {
    onCompleted: data => {
      setTestResult({
        success: true,
        message: data.testCustomModel.content || "Connection successful!",
      });
      notifications.show({
        title: "Success",
        message: "Model Connection Checked successfully",
        color: "green",
      });
    },
    onError: error => {
      setTestResult({
        success: false,
        message: error.message || "Failed to connect to model",
      });
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData && mode === "edit") {
        setFormData(initialData);
        setTestPrompt("2+2=?");
      } else {
        setFormData({
          name: "",
          modelId: "",
          description: "",
          endpoint: "",
          apiKey: "",
          modelName: "",
          protocol: CustomModelProtocol.OPENAI_CHAT_COMPLETIONS,
          streaming: true,
          imageInput: false,
          maxInputTokens: undefined,
        });
        setTestPrompt("Hey, there!");
      }
      setTestResult(null);
    }
  }, [isOpen, initialData, mode]);

  const updateFormField = (field: keyof CustomModelFormData, value: string | boolean | number | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (testResult) setTestResult(null); // Reset test result on change
  };

  const handleTest = async () => {
    if (!formData.endpoint || !formData.modelName) {
      notifications.show({
        title: "Validation Error",
        message: "Endpoint, API Key and Model Name (API) are required for testing",
        color: "red",
      });
      return;
    }

    setTestResult(null);
    try {
      await testCustomModel({
        variables: {
          input: {
            endpoint: formData.endpoint,
            apiKey: initialData?.apiKey === formData.apiKey ? undefined : formData.apiKey,
            modelName: formData.modelName,
            modelId: formData.modelId,
            protocol: formData.protocol,
            text: testPrompt || "Hey there!",
          },
        },
      });
    } catch (e) {
      // Handled by onError
    }
  };

  const handleSubmit = async () => {
    // Validate required fields
    if (
      !formData.name ||
      !formData.modelId ||
      !formData.endpoint ||
      (!formData.apiKey && !initialData?.apiKey) ||
      !formData.modelName
    ) {
      notifications.show({
        title: "Validation Error",
        message: "Please fill in all required fields",
        color: "red",
      });
      return;
    }

    const data = { ...formData };
    if (formData.apiKey === initialData?.apiKey) {
      data.apiKey = undefined; // Do not send unchanged API key
    }

    await onSubmit(data);
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  const canTest = !!(formData.endpoint && formData.apiKey && formData.modelName);

  return (
    <Modal
      opened={isOpen}
      onClose={handleClose}
      title={
        <Text size="lg" fw={600}>
          {mode === "create" ? "Add Custom Model" : "Edit Custom Model"}
        </Text>
      }
      size="lg"
      closeOnClickOutside={!isLoading}
      closeOnEscape={!isLoading}
    >
      <Stack gap="md">
        <Group grow align="flex-end">
          <TextInput
            label="Model Name"
            placeholder="e.g., Deepseek Chat"
            required
            value={formData.name}
            onChange={e => updateFormField("name", e.target.value)}
            disabled={isLoading}
          />

          <TextInput
            label="Model ID"
            placeholder="e.g., deepseek-chat"
            description="Unique identifier for this model in your system"
            required
            value={formData.modelId}
            onChange={e => updateFormField("modelId", e.target.value)}
            disabled={isLoading}
          />
        </Group>

        <Group grow align="flex-end">
          <TextInput
            label="Endpoint URL"
            placeholder="e.g., https://api.deepseek.com/v1"
            description="Base URL for the API (without /chat/completions)"
            required
            value={formData.endpoint}
            onChange={e => updateFormField("endpoint", e.target.value)}
            disabled={isLoading}
          />
          <TextInput
            label="API Key"
            placeholder="sk-..."
            type={initialData?.apiKey ? "text" : "password"}
            required
            value={formData.apiKey}
            onChange={e => updateFormField("apiKey", e.target.value)}
            disabled={isLoading}
          />
        </Group>

        <Group grow align="flex-end">
          <TextInput
            label="Model Name (API)"
            placeholder="e.g., deepseek-chat"
            description="The model identifier to send to the API"
            required
            value={formData.modelName}
            onChange={e => updateFormField("modelName", e.target.value)}
            disabled={isLoading}
          />
          <Select
            label="Protocol"
            required
            data={[
              { value: CustomModelProtocol.OPENAI_CHAT_COMPLETIONS, label: "OpenAI Chat Completions" },
              { value: CustomModelProtocol.OPENAI_RESPONSES, label: "OpenAI Responses API" },
            ]}
            value={formData.protocol}
            onChange={value => updateFormField("protocol", value || CustomModelProtocol.OPENAI_CHAT_COMPLETIONS)}
            disabled={isLoading}
          />
        </Group>

        <Group grow align="flex-end">
          <Stack>
            <Switch
              label="Streaming"
              checked={formData.streaming}
              onChange={event => updateFormField("streaming", event.currentTarget.checked)}
              disabled={isLoading}
              mb="xs"
            />
            <Switch
              label="Image Input"
              checked={formData.imageInput}
              onChange={event => updateFormField("imageInput", event.currentTarget.checked)}
              disabled={isLoading}
              mb="xs"
            />
          </Stack>
          <NumberInput
            label="Max Input Tokens"
            placeholder="e.g., 8192"
            description="Maximum number of input tokens the model can handle"
            value={formData.maxInputTokens}
            onChange={value => updateFormField("maxInputTokens", value)}
            min={1}
            max={2_000_000}
            step={100}
          />
        </Group>

        <Textarea
          label="Description"
          placeholder="e.g., Deepseek AI chat model with reasoning capabilities"
          rows={3}
          value={formData.description}
          onChange={e => updateFormField("description", e.target.value)}
          disabled={isLoading}
        />
        <Divider />

        <Textarea
          label="Test prompt"
          placeholder="2+2=?"
          rows={3}
          value={testPrompt}
          onChange={e => setTestPrompt(e.target.value)}
          disabled={!canTest || isLoading}
        />

        {testResult && (
          <Alert
            icon={testResult.success ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}
            title={testResult.success ? "Connection Successful" : "Connection Failed"}
            color={testResult.success ? "green" : "red"}
            variant="light"
          >
            {testResult.message}
          </Alert>
        )}

        <Group justify="space-between" mt="md">
          <Button
            leftSection={<IconTestPipe size={16} />}
            variant="light"
            onClick={handleTest}
            loading={testing}
            disabled={!canTest || isLoading}
          >
            Test Connection
          </Button>

          <Group>
            <Button variant="default" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={isLoading}>
              {mode === "create" ? "Create Model" : "Save Changes"}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};
