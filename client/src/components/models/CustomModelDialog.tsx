import React, { useState } from "react";
import { Modal, TextInput, Select, Button, Stack, Group, Text, Textarea } from "@mantine/core";
import { CustomModelProtocol } from "@katechat/ui";
import { notifications } from "@mantine/notifications";

interface CustomModelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CustomModelFormData) => Promise<void>;
  onTest?: (data: CustomModelFormData) => Promise<void>;
  isLoading?: boolean;
}

export interface CustomModelFormData {
  name: string;
  modelId: string;
  description: string;
  endpoint: string;
  apiKey: string;
  modelName: string;
  protocol: string;
}

export const CustomModelDialog: React.FC<CustomModelDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  onTest,
  isLoading = false,
}) => {
  const [formData, setFormData] = useState<CustomModelFormData>({
    name: "",
    modelId: "",
    description: "",
    endpoint: "",
    apiKey: "",
    modelName: "",
    protocol: CustomModelProtocol.OPENAI_CHAT_COMPLETIONS,
  });

  const [testLoading, setTestLoading] = useState(false);

  const handleSubmit = async () => {
    // Validate required fields
    if (!formData.name || !formData.modelId || !formData.endpoint || !formData.apiKey || !formData.modelName) {
      notifications.show({
        title: "Validation Error",
        message: "Please fill in all required fields",
        color: "red",
      });
      return;
    }

    try {
      await onSubmit(formData);
      // Reset form and close
      setFormData({
        name: "",
        modelId: "",
        description: "",
        endpoint: "",
        apiKey: "",
        modelName: "",
        protocol: CustomModelProtocol.OPENAI_CHAT_COMPLETIONS,
      });
      onClose();
    } catch (error) {
      // Error is handled by the parent component
    }
  };

  const handleTest = async () => {
    if (!onTest) return;

    // Validate required fields
    if (!formData.endpoint || !formData.apiKey || !formData.modelName) {
      notifications.show({
        title: "Validation Error",
        message: "Please fill in endpoint, API key, and model name to test",
        color: "red",
      });
      return;
    }

    setTestLoading(true);
    try {
      await onTest(formData);
    } finally {
      setTestLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading && !testLoading) {
      setFormData({
        name: "",
        modelId: "",
        description: "",
        endpoint: "",
        apiKey: "",
        modelName: "",
        protocol: CustomModelProtocol.OPENAI_CHAT_COMPLETIONS,
      });
      onClose();
    }
  };

  return (
    <Modal
      opened={isOpen}
      onClose={handleClose}
      title={<Text size="lg" fw={600}>Add Custom Model</Text>}
      size="lg"
      closeOnClickOutside={!isLoading && !testLoading}
      closeOnEscape={!isLoading && !testLoading}
    >
      <Stack gap="md">
        <TextInput
          label="Model Name"
          placeholder="e.g., Deepseek Chat"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          disabled={isLoading || testLoading}
        />

        <TextInput
          label="Model ID"
          placeholder="e.g., deepseek-chat"
          description="Unique identifier for this model in your system"
          required
          value={formData.modelId}
          onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
          disabled={isLoading || testLoading}
        />

        <TextInput
          label="Endpoint URL"
          placeholder="e.g., https://api.deepseek.com/v1"
          description="Base URL for the API (without /chat/completions)"
          required
          value={formData.endpoint}
          onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
          disabled={isLoading || testLoading}
        />

        <TextInput
          label="API Key"
          placeholder="sk-..."
          type="password"
          required
          value={formData.apiKey}
          onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
          disabled={isLoading || testLoading}
        />

        <TextInput
          label="Model Name (API)"
          placeholder="e.g., deepseek-chat"
          description="The model identifier to send to the API"
          required
          value={formData.modelName}
          onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
          disabled={isLoading || testLoading}
        />

        <Select
          label="Protocol"
          required
          data={[
            { value: CustomModelProtocol.OPENAI_CHAT_COMPLETIONS, label: "OpenAI Chat Completions" },
            { value: CustomModelProtocol.OPENAI_RESPONSES, label: "OpenAI Responses API" },
          ]}
          value={formData.protocol}
          onChange={(value) => setFormData({ ...formData, protocol: value || CustomModelProtocol.OPENAI_CHAT_COMPLETIONS })}
          disabled={isLoading || testLoading}
        />

        <Textarea
          label="Description"
          placeholder="e.g., Deepseek AI chat model with reasoning capabilities"
          rows={3}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          disabled={isLoading || testLoading}
        />

        <Group justify="flex-end" mt="md">
          <Button
            variant="default"
            onClick={handleClose}
            disabled={isLoading || testLoading}
          >
            Cancel
          </Button>
          {onTest && (
            <Button
              variant="light"
              onClick={handleTest}
              loading={testLoading}
              disabled={isLoading}
            >
              Test Connection
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            loading={isLoading}
            disabled={testLoading}
          >
            Create Model
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
