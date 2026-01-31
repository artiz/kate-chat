import React, { useState } from "react";
import { Modal, TextInput, Select, Button, Stack, Group, Text, Textarea } from "@mantine/core";
import { CustomModelProtocol } from "@katechat/ui";
import { notifications } from "@mantine/notifications";

interface CustomModelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CustomModelFormData) => Promise<void>;
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

  const updateFormField = (field: keyof CustomModelFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

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

  const handleClose = () => {
    if (!isLoading) {
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
      closeOnClickOutside={!isLoading}
      closeOnEscape={!isLoading}
    >
      <Stack gap="md">
        <TextInput
          label="Model Name"
          placeholder="e.g., Deepseek Chat"
          required
          value={formData.name}
          onChange={(e) => updateFormField('name', e.target.value)}
          disabled={isLoading}
        />

        <TextInput
          label="Model ID"
          placeholder="e.g., deepseek-chat"
          description="Unique identifier for this model in your system"
          required
          value={formData.modelId}
          onChange={(e) => updateFormField('modelId', e.target.value)}
          disabled={isLoading}
        />

        <TextInput
          label="Endpoint URL"
          placeholder="e.g., https://api.deepseek.com/v1"
          description="Base URL for the API (without /chat/completions)"
          required
          value={formData.endpoint}
          onChange={(e) => updateFormField('endpoint', e.target.value)}
          disabled={isLoading}
        />

        <TextInput
          label="API Key"
          placeholder="sk-..."
          type="password"
          required
          value={formData.apiKey}
          onChange={(e) => updateFormField('apiKey', e.target.value)}
          disabled={isLoading}
        />

        <TextInput
          label="Model Name (API)"
          placeholder="e.g., deepseek-chat"
          description="The model identifier to send to the API"
          required
          value={formData.modelName}
          onChange={(e) => updateFormField('modelName', e.target.value)}
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
          onChange={(value) => updateFormField('protocol', value || CustomModelProtocol.OPENAI_CHAT_COMPLETIONS)}
          disabled={isLoading}
        />

        <Textarea
          label="Description"
          placeholder="e.g., Deepseek AI chat model with reasoning capabilities"
          rows={3}
          value={formData.description}
          onChange={(e) => updateFormField('description', e.target.value)}
          disabled={isLoading}
        />

        <Group justify="flex-end" mt="md">
          <Button
            variant="default"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={isLoading}
          >
            Create Model
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
