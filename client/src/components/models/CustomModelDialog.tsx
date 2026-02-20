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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
        title: t("common.success"),
        message: t("models.modelConnectionChecked"),
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

  const noEndpointRequired = formData.protocol === CustomModelProtocol.AWS_BEDROCK_CUSTOM;

  const handleTest = async () => {
    if (noEndpointRequired && !formData.modelName) {
      notifications.show({
        title: t("models.validationError"),
        message: t("models.testModelRequired"),
        color: "red",
      });
      return;
    } else if (!noEndpointRequired && (!formData.endpoint || !formData.modelName)) {
      notifications.show({
        title: t("models.validationError"),
        message: t("models.testEndpointRequired"),
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
      (!noEndpointRequired && !formData.endpoint) ||
      (!noEndpointRequired && !formData.apiKey && !initialData?.apiKey) ||
      !formData.modelName
    ) {
      notifications.show({
        title: t("models.validationError"),
        message: t("models.fillRequiredFields"),
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

  const canTest = !!(((formData.endpoint && formData.apiKey) || noEndpointRequired) && formData.modelName);

  return (
    <Modal
      opened={isOpen}
      onClose={handleClose}
      title={
        <Text size="lg" fw={600}>
          {mode === "create" ? t("models.addCustomModel") : t("models.editCustomModel")}
        </Text>
      }
      size="lg"
      closeOnClickOutside={!isLoading}
      closeOnEscape={!isLoading}
    >
      <Stack gap="md">
        <Group grow align="flex-end">
          <TextInput
            label={t("models.modelName")}
            placeholder="e.g., Deepseek Chat"
            required
            value={formData.name}
            onChange={e => updateFormField("name", e.target.value)}
            disabled={isLoading}
            autoComplete="off"
          />

          <TextInput
            label={t("models.modelId")}
            placeholder="e.g., deepseek-chat"
            description={t("models.modelIdDescription")}
            required
            value={formData.modelId}
            onChange={e => updateFormField("modelId", e.target.value)}
            disabled={isLoading}
            autoComplete="off"
          />
        </Group>

        {noEndpointRequired ? null : (
          <Group grow align="flex-end">
            <TextInput
              label={t("models.endpointUrl")}
              placeholder="e.g., https://api.deepseek.com/v1"
              description={t("models.endpointUrlDescription")}
              required
              value={formData.endpoint}
              onChange={e => updateFormField("endpoint", e.target.value)}
              disabled={isLoading || noEndpointRequired}
              autoComplete="off"
            />
            <TextInput
              label={t("models.apiKey")}
              placeholder="sk-..."
              type={initialData?.apiKey ? "text" : "password"}
              required
              value={formData.apiKey}
              onChange={e => updateFormField("apiKey", e.target.value)}
              disabled={isLoading || noEndpointRequired}
              autoComplete="off"
            />
          </Group>
        )}

        <Group grow align="flex-end">
          <TextInput
            label={t("models.modelNameApi")}
            placeholder="e.g., deepseek-chat"
            description={t("models.modelNameApiDescription")}
            required
            value={formData.modelName}
            onChange={e => updateFormField("modelName", e.target.value)}
            disabled={isLoading}
            autoComplete="off"
          />
          <Select
            label={t("models.protocol")}
            required
            data={[
              { value: CustomModelProtocol.OPENAI_CHAT_COMPLETIONS, label: t("models.openaiChatCompletions") },
              { value: CustomModelProtocol.OPENAI_RESPONSES, label: t("models.openaiResponsesApi") },
              { value: CustomModelProtocol.AWS_BEDROCK_CUSTOM, label: t("models.awsBedrockCustom") },
            ]}
            value={formData.protocol}
            onChange={value => updateFormField("protocol", value || CustomModelProtocol.OPENAI_CHAT_COMPLETIONS)}
            disabled={isLoading}
          />
        </Group>

        <Group grow align="flex-end">
          <Stack>
            <Switch
              label={t("models.streaming")}
              checked={formData.streaming}
              onChange={event => updateFormField("streaming", event.currentTarget.checked)}
              disabled={isLoading}
              mb="xs"
            />
            <Switch
              label={t("models.imageInput")}
              checked={formData.imageInput}
              onChange={event => updateFormField("imageInput", event.currentTarget.checked)}
              disabled={isLoading}
              mb="xs"
            />
          </Stack>

          <NumberInput
            label={t("models.maxInputTokensLabel")}
            placeholder="e.g., 8192"
            description={t("models.maxInputTokensDescription")}
            value={formData.maxInputTokens}
            onChange={value => updateFormField("maxInputTokens", value)}
            min={1}
            max={2_000_000}
            step={100}
          />
        </Group>

        <Textarea
          label={t("common.description")}
          placeholder="e.g., Deepseek AI chat model with reasoning capabilities"
          rows={3}
          value={formData.description}
          onChange={e => updateFormField("description", e.target.value)}
          disabled={isLoading}
        />
        <Divider />

        <Textarea
          label={t("models.testPrompt")}
          placeholder="2+2=?"
          rows={3}
          value={testPrompt}
          onChange={e => setTestPrompt(e.target.value)}
          disabled={!canTest || isLoading}
        />

        {testResult && (
          <Alert
            icon={testResult.success ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}
            title={testResult.success ? t("models.testConnectionSuccess") : t("models.testConnectionFailed")}
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
            {t("models.testConnection")}
          </Button>

          <Group>
            <Button variant="default" onClick={handleClose} disabled={isLoading}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSubmit} loading={isLoading}>
              {mode === "create" ? t("models.createModel") : t("models.saveChanges")}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};
