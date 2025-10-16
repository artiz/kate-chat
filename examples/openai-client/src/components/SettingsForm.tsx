import React, { useState } from "react";
import {
  Stack,
  TextInput,
  Select,
  Button,
  PasswordInput,
  Text,
  Group,
} from "@mantine/core";
import { ApiMode } from "../lib/openai-client";

interface SettingsFormProps {
  apiKey: string;
  apiEndpoint: string;
  apiMode: ApiMode;
  modelName: string;
  onSave: (settings: {
    apiKey: string;
    apiEndpoint: string;
    apiMode: ApiMode;
    modelName: string;
  }) => void;
}

const PRESET_ENDPOINTS = [
  { value: "https://api.openai.com/v1", label: "OpenAI" },
  { value: "https://api.deepseek.com/v1", label: "DeepSeek" },
  { value: "custom", label: "Custom Endpoint" },
];

export const DEFAULT_MODEL = "gpt-4.1";

export const SettingsForm: React.FC<SettingsFormProps> = ({
  apiKey: initialApiKey,
  apiEndpoint: initialApiEndpoint,
  apiMode: initialApiMode,
  modelName: initialModelName,
  onSave,
}) => {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [endpointPreset, setEndpointPreset] = useState(() => {
    const preset = PRESET_ENDPOINTS.find((p) => p.value === initialApiEndpoint);
    return preset ? preset.value : "custom";
  });
  const [customEndpoint, setCustomEndpoint] = useState(
    PRESET_ENDPOINTS.find((p) => p.value === initialApiEndpoint)
      ? ""
      : initialApiEndpoint,
  );
  const [apiMode, setApiMode] = useState<ApiMode>(initialApiMode);
  const [modelName, setModelName] = useState(initialModelName);

  const handleSave = () => {
    const endpoint =
      endpointPreset === "custom" ? customEndpoint : endpointPreset;
    onSave({ apiKey, apiEndpoint: endpoint, apiMode, modelName });
  };

  const isValid =
    apiKey.trim() !== "" &&
    (endpointPreset !== "custom" || customEndpoint.trim() !== "");

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Configure your OpenAI-compatible API settings. Your API key is stored
        locally in your browser.
      </Text>

      <PasswordInput
        label="API Key"
        placeholder="sk-..."
        value={apiKey}
        onChange={(e) => setApiKey(e.currentTarget.value)}
        required
      />

      <Select
        label="API Endpoint"
        data={PRESET_ENDPOINTS}
        value={endpointPreset}
        onChange={(value) => setEndpointPreset(value || "custom")}
        required
      />

      {endpointPreset === "custom" && (
        <TextInput
          label="Custom Endpoint URL"
          placeholder="https://api.example.com/v1"
          value={customEndpoint}
          onChange={(e) => setCustomEndpoint(e.currentTarget.value)}
          required
        />
      )}

      <Select
        label="API Mode"
        description="Chat Completions mode uses /chat/completions, Responses mode uses /responses endpoint"
        data={[
          { value: "completions", label: "Chat Completions" },
          { value: "responses", label: "Responses" },
        ]}
        value={apiMode}
        onChange={(value) => setApiMode(value as ApiMode)}
        required
      />

      <TextInput
        label="Enter model name"
        placeholder={DEFAULT_MODEL}
        value={modelName}
        onChange={(e) => setModelName(e.currentTarget.value)}
        required
      />

      <Group justify="flex-end" mt="md">
        <Button onClick={handleSave} disabled={!isValid}>
          Save Settings
        </Button>
      </Group>
    </Stack>
  );
};
