import React, { useState, useEffect, useMemo } from "react";
import { Title, Paper, Button, Group, Stack, Select, Textarea, SimpleGrid, NumberInput } from "@mantine/core";
import { ModelType } from "@katechat/ui";
import { useAppSelector } from "@/store";
import { UpdateUserInput, User } from "@/store/slices/userSlice";

interface AISettingsProps {
  user: User;
  updateLoading?: boolean;
  updateUser: (input: UpdateUserInput) => Promise<void>;
}

export const AISettings: React.FC<AISettingsProps> = ({ user, updateUser, updateLoading }) => {
  const { models } = useAppSelector(state => state.models);

  // Default settings form state
  const [defaultModelId, setDefaultModelId] = useState<string>();
  const [defaultSystemPrompt, setDefaultSystemPrompt] = useState<string>();
  const [defaultTemperature, setDefaultTemperature] = useState<number>();
  const [defaultMaxTokens, setDefaultMaxTokens] = useState<number>();
  const [defaultTopP, setDefaultTopP] = useState<number>();
  const [defaultImagesCount, setDefaultImagesCount] = useState<number>();
  const [documentsEmbeddingsModelId, setDocumentsEmbeddingsModelId] = useState<string>();
  const [documentSummarizationModelId, setDocumentSummarizationModelId] = useState<string>();

  const handleDefaultsReset = () => {
    setDefaultModelId(user?.defaultModelId);
    setDefaultSystemPrompt(user?.defaultSystemPrompt);
    setDefaultTemperature(user?.defaultTemperature);
    setDefaultMaxTokens(user?.defaultMaxTokens);
    setDefaultTopP(user?.defaultTopP);
    setDefaultImagesCount(user?.defaultImagesCount);
  };

  const handleDocumentsModelsReset = () => {
    setDocumentsEmbeddingsModelId(user?.documentsEmbeddingsModelId);
    setDocumentSummarizationModelId(user?.documentSummarizationModelId);
  };

  useEffect(() => {
    handleDefaultsReset();
    handleDocumentsModelsReset();
  }, [user]);

  // Handle default model and system prompt update
  const handleUserDefaultsUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateUser({
      defaultModelId,
      defaultSystemPrompt,
      defaultTemperature,
      defaultMaxTokens,
      defaultTopP,
      defaultImagesCount,
      documentsEmbeddingsModelId,
      documentSummarizationModelId,
    });
  };

  const modelSelectData = models
    .filter(model => model.isActive && model.type !== ModelType.EMBEDDING)
    .map(model => ({
      value: model.modelId,
      label: `${model.apiProvider}: ${model.name}`,
    }));

  const embeddingModelSelectData = models
    .filter(model => model.isActive && model.type === ModelType.EMBEDDING)
    .map(model => ({
      value: model.modelId,
      label: `${model.apiProvider}: ${model.name}`,
    }));

  const isUserSettingsDirty =
    defaultModelId !== user?.defaultModelId ||
    defaultSystemPrompt !== user?.defaultSystemPrompt ||
    defaultTemperature !== user?.defaultTemperature ||
    defaultMaxTokens !== user?.defaultMaxTokens ||
    defaultTopP !== user?.defaultTopP ||
    defaultImagesCount !== user?.defaultImagesCount;

  const isDocumentsSettingsDirty =
    documentsEmbeddingsModelId !== user?.documentsEmbeddingsModelId ||
    documentSummarizationModelId !== user?.documentSummarizationModelId;

  if (!user) return null;

  return (
    <Stack gap="lg">
      <Paper withBorder p="md">
        <Title order={4} mb="md">
          Chat Defaults
        </Title>
        <form name="user-defaults-settings" onSubmit={handleUserDefaultsUpdate}>
          <Stack gap="md">
            <Select
              label="Default AI Model"
              description="This model will be used by default for new chats"
              placeholder="Select a model"
              value={defaultModelId}
              onChange={value => setDefaultModelId(value || "")}
              data={modelSelectData}
              searchable
              clearable
            />

            <Textarea
              label="Default System Prompt"
              description="This prompt will be used for all new chats to guide model behavior"
              placeholder="You are a helpful AI assistant..."
              value={defaultSystemPrompt}
              onChange={e => setDefaultSystemPrompt(e.currentTarget.value)}
              autosize
              minRows={3}
              maxRows={6}
            />

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <NumberInput
                label="Default Temperature"
                description="Controls randomness (0-1)"
                placeholder="0.7"
                value={defaultTemperature}
                onChange={value => setDefaultTemperature(typeof value === "number" ? value : undefined)}
                min={0}
                max={1}
                step={0.01}
                decimalScale={2}
              />

              <NumberInput
                label="Default Max Tokens"
                description="Maximum tokens to generate"
                placeholder="2048"
                value={defaultMaxTokens}
                onChange={value => setDefaultMaxTokens(typeof value === "number" ? value : undefined)}
                min={1}
                max={100000}
                step={100}
              />

              <NumberInput
                label="Default Top P"
                description="Nucleus sampling threshold (0-1)"
                placeholder="0.9"
                value={defaultTopP}
                onChange={value => setDefaultTopP(typeof value === "number" ? value : undefined)}
                min={0}
                max={1}
                step={0.01}
                decimalScale={2}
              />

              <NumberInput
                label="Default Images Count"
                description="Number of images to generate"
                placeholder="1"
                value={defaultImagesCount}
                onChange={value => setDefaultImagesCount(typeof value === "number" ? value : undefined)}
                min={1}
                max={10}
                step={1}
              />
            </SimpleGrid>

            <Group justify="right" mt="md">
              <Button
                type="reset"
                color="gray"
                loading={updateLoading}
                onClick={handleDefaultsReset}
                disabled={!isUserSettingsDirty}
              >
                Reset
              </Button>
              <Button type="submit" color="green" loading={updateLoading} disabled={!isUserSettingsDirty}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>

      <Paper withBorder p="md">
        <form name="documents-defaults-settings" onSubmit={handleUserDefaultsUpdate}>
          <Stack gap="md">
            <Title order={4}>
              <a id="document_processing">Document Processing</a>
            </Title>

            <Select
              label="Documents Embeddings Model"
              description="Model used to generate vector embeddings for document chunks"
              placeholder="Select an embeddings model"
              value={documentsEmbeddingsModelId}
              onChange={value => setDocumentsEmbeddingsModelId(value || "")}
              data={embeddingModelSelectData}
              searchable
              clearable
            />

            <Select
              label="Document Summarization Model"
              description="Model used to generate document summaries (up to 1024 words)"
              placeholder="Select a chat model"
              value={documentSummarizationModelId}
              onChange={value => setDocumentSummarizationModelId(value || "")}
              data={modelSelectData}
              searchable
              clearable
            />

            <Group justify="right" mt="md">
              <Button
                type="reset"
                color="gray"
                loading={updateLoading}
                onClick={handleDocumentsModelsReset}
                disabled={!isDocumentsSettingsDirty}
              >
                Reset
              </Button>
              <Button type="submit" color="green" loading={updateLoading} disabled={!isDocumentsSettingsDirty}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
};
