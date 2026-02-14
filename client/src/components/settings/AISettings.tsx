import React, { useState, useEffect, useMemo } from "react";
import { Title, Paper, Button, Group, Stack, Select, Textarea, SimpleGrid, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ModelType } from "@katechat/ui";
import { useAppSelector } from "@/store";
import { UpdateUserInput, User } from "@/store/slices/userSlice";

interface AISettingsProps {
  user: User;
  updateLoading?: boolean;
  updateUser: (input: UpdateUserInput) => Promise<void>;
}

export const AISettings: React.FC<AISettingsProps> = ({ user, updateUser, updateLoading }) => {
  const { t } = useTranslation();
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

  const modelSelectData = useMemo(
    () =>
      models
        .filter(model => model.isActive && model.type !== ModelType.EMBEDDING)
        .map(model => ({
          value: model.modelId,
          label: `${model.apiProvider}: ${model.name}`,
        })),
    [models]
  );

  const embeddingModelSelectData = useMemo(
    () =>
      models
        .filter(model => model.isActive && model.type === ModelType.EMBEDDING)
        .map(model => ({
          value: model.modelId,
          label: `${model.apiProvider}: ${model.name}`,
        })),
    [models]
  );

  const isUserSettingsDirty = useMemo(
    () =>
      defaultModelId !== user?.defaultModelId ||
      defaultSystemPrompt !== user?.defaultSystemPrompt ||
      defaultTemperature !== user?.defaultTemperature ||
      defaultMaxTokens !== user?.defaultMaxTokens ||
      defaultTopP !== user?.defaultTopP ||
      defaultImagesCount !== user?.defaultImagesCount,
    [defaultModelId, defaultSystemPrompt, defaultTemperature, defaultMaxTokens, defaultTopP, defaultImagesCount, user]
  );

  const isDocumentsSettingsDirty = useMemo(
    () =>
      documentsEmbeddingsModelId !== user?.documentsEmbeddingsModelId ||
      documentSummarizationModelId !== user?.documentSummarizationModelId,
    [documentsEmbeddingsModelId, documentSummarizationModelId, user]
  );

  if (!user) return null;

  return (
    <Stack gap="lg">
      <Paper withBorder p="md">
        <Title order={4} mb="md">
          {t("aiSettings.chatDefaults")}
        </Title>
        <form name="user-defaults-settings" onSubmit={handleUserDefaultsUpdate}>
          <Stack gap="md">
            <Select
              label={t("aiSettings.defaultModel")}
              description={t("aiSettings.defaultModelDescription")}
              placeholder={t("aiSettings.selectModel")}
              value={defaultModelId}
              onChange={value => setDefaultModelId(value || "")}
              data={modelSelectData}
              searchable
              clearable
            />

            <Textarea
              label={t("aiSettings.defaultSystemPrompt")}
              description={t("aiSettings.defaultSystemPromptDescription")}
              placeholder={t("aiSettings.defaultSystemPromptPlaceholder")}
              value={defaultSystemPrompt}
              onChange={e => setDefaultSystemPrompt(e.currentTarget.value)}
              autosize
              minRows={3}
              maxRows={6}
            />

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <NumberInput
                label={t("aiSettings.defaultTemperature")}
                description={t("aiSettings.defaultTemperatureDescription")}
                placeholder="0.7"
                value={defaultTemperature}
                onChange={value => setDefaultTemperature(typeof value === "number" ? value : undefined)}
                min={0}
                max={1}
                step={0.01}
                decimalScale={2}
              />

              <NumberInput
                label={t("aiSettings.defaultMaxTokens")}
                description={t("aiSettings.defaultMaxTokensDescription")}
                placeholder="2048"
                value={defaultMaxTokens}
                onChange={value => setDefaultMaxTokens(typeof value === "number" ? value : undefined)}
                min={1}
                max={100000}
                step={100}
              />

              <NumberInput
                label={t("aiSettings.defaultTopP")}
                description={t("aiSettings.defaultTopPDescription")}
                placeholder="0.9"
                value={defaultTopP}
                onChange={value => setDefaultTopP(typeof value === "number" ? value : undefined)}
                min={0}
                max={1}
                step={0.01}
                decimalScale={2}
              />

              <NumberInput
                label={t("aiSettings.defaultImagesCount")}
                description={t("aiSettings.defaultImagesCountDescription")}
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
                {t("common.reset")}
              </Button>
              <Button type="submit" color="green" loading={updateLoading} disabled={!isUserSettingsDirty}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>

      <Paper withBorder p="md">
        <form name="documents-defaults-settings" onSubmit={handleUserDefaultsUpdate}>
          <Stack gap="md">
            <Title order={4}>
              <a id="document_processing">{t("aiSettings.documentProcessing")}</a>
            </Title>

            <Select
              name="embeddings-model"
              label={t("aiSettings.embeddingsModel")}
              description={t("aiSettings.embeddingsModelDescription")}
              placeholder={t("aiSettings.selectEmbeddingsModel")}
              value={documentsEmbeddingsModelId}
              onChange={value => setDocumentsEmbeddingsModelId(value || "")}
              data={embeddingModelSelectData}
              searchable
              clearable
            />

            <Select
              name="summarization-model"
              label={t("aiSettings.summarizationModel")}
              description={t("aiSettings.summarizationModelDescription")}
              placeholder={t("aiSettings.selectChatModel")}
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
                {t("common.reset")}
              </Button>
              <Button type="submit" color="green" loading={updateLoading} disabled={!isDocumentsSettingsDirty}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
};
