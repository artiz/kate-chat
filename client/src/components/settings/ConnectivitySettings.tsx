import React, { useState, useEffect, useMemo } from "react";
import {
  Title,
  Paper,
  TextInput,
  PasswordInput,
  Button,
  Group,
  Stack,
  Text,
  Collapse,
  ActionIcon,
  SimpleGrid,
  Alert,
  Switch,
  Badge,
} from "@mantine/core";
import { IconHelp } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { ApiProvider } from "@katechat/ui";
import { useAppSelector } from "@/store";
import { UpdateUserInput, User, UserSettings } from "@/store/slices/userSlice";
import {
  STORAGE_AWS_BEDROCK_ACCESS_KEY_ID,
  STORAGE_AWS_BEDROCK_PROFILE,
  STORAGE_AWS_BEDROCK_REGION,
  STORAGE_AWS_BEDROCK_SECRET_ACCESS_KEY,
  STORAGE_OPENAI_API_ADMIN_KEY,
  STORAGE_OPENAI_API_KEY,
  STORAGE_YANDEX_FM_API_FOLDER,
  STORAGE_YANDEX_FM_API_KEY,
} from "@/store/slices/authSlice";
import { CredentialSourceType, CredentialType } from "@/types/graphql";

interface AISettingsProps {
  user: User;
  updateLoading?: boolean;
  updateUser: (input: UpdateUserInput) => Promise<void>;
}

export const ConnectivitySettings: React.FC<AISettingsProps> = ({ user, updateUser, updateLoading }) => {
  const { t } = useTranslation();
  const { appConfig } = useAppSelector(state => state.user);
  const { providers } = useAppSelector(state => state.models);

  // local connection settings
  const [awsRegion, setAwsRegion] = useState<string>("");
  const [awsProfile, setAwsProfile] = useState<string>("");
  const [awsAccessKeyId, setAwsAccessKeyId] = useState<string>("");
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState<string>("");
  const [openaiApiKey, setOpenaiApiKey] = useState<string>("");
  const [openaiApiAdminKey, setOpenaiApiAdminKey] = useState<string>("");
  const [yandexApiKey, setYandexApiKey] = useState<string>("");
  const [yandexApiFolderId, setYandexApiFolderId] = useState<string>("");
  const [s3Endpoint, setS3Endpoint] = useState<string>("");
  const [s3Region, setS3Region] = useState<string>("");
  const [s3AccessKeyId, setS3AccessKeyId] = useState<string>("");
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState<string>("");
  const [s3FilesBucketName, setS3FilesBucketName] = useState<string>("");

  // Help section state
  const [awsHelpOpen, setAwsHelpOpen] = useState(false);
  const [openaiHelpOpen, setOpenaiHelpOpen] = useState(false);
  const [yandexHelpOpen, setYandexHelpOpen] = useState(false);
  const [awsBedrockServerSave, setAwsBedrockServerSave] = useState(false);
  const [openAiServerSave, setOpenAiServerSave] = useState(false);
  const [yandexFmServerSave, setYandexFmServerSave] = useState(false);

  const [s3HelpOpen, setS3HelpOpen] = useState(false);

  const enabledApiProviders: Set<ApiProvider> = useMemo(() => {
    return new Set(providers.map(provider => provider.id as ApiProvider));
  }, [providers]);

  const apiProvidersCredSource: Record<CredentialType, CredentialSourceType> = useMemo(() => {
    const map: Record<CredentialType, CredentialSourceType> = {} as Record<CredentialType, CredentialSourceType>;
    providers.forEach(provider => {
      const src = appConfig?.credentialsSource?.find(c => c.type === provider.id);
      if (src) {
        map[provider.id] = src.source;
      }
    });

    const s3Src = appConfig?.credentialsSource?.find(c => c.type === "S3");
    if (s3Src) {
      map["S3"] = s3Src.source;
    }

    return map;
  }, [providers, appConfig]);

  useEffect(() => {
    const settings = user?.settings || {};

    // Load initial connection settings from localStorage or defaults
    if (enabledApiProviders.has("AWS_BEDROCK")) {
      setAwsRegion(localStorage.getItem(STORAGE_AWS_BEDROCK_REGION) || settings.awsBedrockRegion || "");
      setAwsProfile(localStorage.getItem(STORAGE_AWS_BEDROCK_PROFILE) || settings.awsBedrockProfile || "");
      setAwsAccessKeyId(
        localStorage.getItem(STORAGE_AWS_BEDROCK_ACCESS_KEY_ID) || settings.awsBedrockAccessKeyId || ""
      );
      setAwsSecretAccessKey(
        localStorage.getItem(STORAGE_AWS_BEDROCK_SECRET_ACCESS_KEY) || settings.awsBedrockSecretAccessKey || ""
      );

      setAwsBedrockServerSave(
        Boolean(
          settings.awsBedrockRegion ||
            settings.awsBedrockProfile ||
            settings.awsBedrockAccessKeyId ||
            settings.awsBedrockSecretAccessKey
        )
      );
    }
    if (enabledApiProviders.has("OPEN_AI")) {
      setOpenaiApiKey(localStorage.getItem(STORAGE_OPENAI_API_KEY) || settings.openaiApiKey || "");
      setOpenaiApiAdminKey(localStorage.getItem(STORAGE_OPENAI_API_ADMIN_KEY) || settings.openaiApiAdminKey || "");

      setOpenAiServerSave(Boolean(settings.openaiApiKey || settings.openaiApiAdminKey));
    }
    if (enabledApiProviders.has("YANDEX_FM")) {
      setYandexApiKey(localStorage.getItem(STORAGE_YANDEX_FM_API_KEY) || settings.yandexFmApiKey || "");
      setYandexApiFolderId(localStorage.getItem(STORAGE_YANDEX_FM_API_FOLDER) || settings.yandexFmApiFolderId || "");

      setYandexFmServerSave(Boolean(settings.yandexFmApiKey || settings.yandexFmApiFolderId));
    }

    // Load S3 settings
    setS3Endpoint(user?.settings?.s3Endpoint || "");
    setS3Region(user?.settings?.s3Region || "");
    setS3AccessKeyId(user?.settings?.s3AccessKeyId || "");
    setS3SecretAccessKey(user?.settings?.s3SecretAccessKey || "");
    setS3FilesBucketName(user?.settings?.s3FilesBucketName || "");
  }, [user, enabledApiProviders, apiProvidersCredSource]);

  const toggleServerSave = (provider: ApiProvider): React.ChangeEventHandler<HTMLInputElement> | undefined => {
    switch (provider) {
      case "AWS_BEDROCK":
        return event => setAwsBedrockServerSave(event.currentTarget.checked);
      case "OPEN_AI":
        return event => setOpenAiServerSave(event.currentTarget.checked);
      case "YANDEX_FM":
        return event => setYandexFmServerSave(event.currentTarget.checked);
      default:
        return undefined;
    }
  };

  const handleConnectivityUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const initialData = user?.settings || {};

    if (awsBedrockServerSave) {
      localStorage.removeItem(STORAGE_AWS_BEDROCK_REGION);
      localStorage.removeItem(STORAGE_AWS_BEDROCK_PROFILE);
      localStorage.removeItem(STORAGE_AWS_BEDROCK_ACCESS_KEY_ID);
      localStorage.removeItem(STORAGE_AWS_BEDROCK_SECRET_ACCESS_KEY);
    } else {
      localStorage.setItem(STORAGE_AWS_BEDROCK_REGION, awsRegion || "");
      localStorage.setItem(STORAGE_AWS_BEDROCK_PROFILE, awsProfile || "");
      localStorage.setItem(STORAGE_AWS_BEDROCK_ACCESS_KEY_ID, awsAccessKeyId || "");
      localStorage.setItem(STORAGE_AWS_BEDROCK_SECRET_ACCESS_KEY, awsSecretAccessKey || "");
    }

    if (openAiServerSave) {
      localStorage.removeItem(STORAGE_OPENAI_API_KEY);
      localStorage.removeItem(STORAGE_OPENAI_API_ADMIN_KEY);
    } else {
      localStorage.setItem(STORAGE_OPENAI_API_KEY, openaiApiKey || "");
      localStorage.setItem(STORAGE_OPENAI_API_ADMIN_KEY, openaiApiAdminKey || "");
    }

    if (yandexFmServerSave) {
      localStorage.removeItem(STORAGE_YANDEX_FM_API_KEY);
      localStorage.removeItem(STORAGE_YANDEX_FM_API_FOLDER);
    } else {
      localStorage.setItem(STORAGE_YANDEX_FM_API_KEY, yandexApiKey || "");
      localStorage.setItem(STORAGE_YANDEX_FM_API_FOLDER, yandexApiFolderId || "");
    }

    const settings: UserSettings = {
      s3Endpoint: s3Endpoint || "",
      s3Region: s3Region || "",
      s3AccessKeyId: initialData?.s3AccessKeyId === s3AccessKeyId ? undefined : s3AccessKeyId,
      s3SecretAccessKey: initialData?.s3SecretAccessKey === s3SecretAccessKey ? undefined : s3SecretAccessKey,
      s3FilesBucketName: s3FilesBucketName || "",

      awsBedrockRegion: awsBedrockServerSave ? awsRegion : "",
      awsBedrockProfile: awsBedrockServerSave ? awsProfile : "",
      awsBedrockAccessKeyId: awsBedrockServerSave
        ? initialData?.awsBedrockAccessKeyId === awsAccessKeyId
          ? undefined
          : awsAccessKeyId
        : "",
      awsBedrockSecretAccessKey: awsBedrockServerSave
        ? initialData?.awsBedrockSecretAccessKey === awsSecretAccessKey
          ? undefined
          : awsSecretAccessKey
        : "",
      openaiApiKey: openAiServerSave ? (initialData?.openaiApiKey === openaiApiKey ? undefined : openaiApiKey) : "",
      openaiApiAdminKey: openAiServerSave
        ? initialData?.openaiApiAdminKey === openaiApiAdminKey
          ? undefined
          : openaiApiAdminKey
        : "",
      yandexFmApiKey: yandexFmServerSave
        ? initialData?.yandexFmApiKey === yandexApiKey
          ? undefined
          : yandexApiKey
        : "",
      yandexFmApiFolderId: yandexFmServerSave
        ? initialData?.yandexFmApiFolderId === yandexApiFolderId
          ? undefined
          : yandexApiFolderId
        : "",
    };

    await updateUser({
      settings,
    });
  };

  if (!user) return null;

  return (
    <Stack gap="0">
      <Group justify="right">
        <Button type="submit" loading={updateLoading} onClick={handleConnectivityUpdate}>
          {t("common.save")}
        </Button>
      </Group>
      <form name="connectivity-settings" onSubmit={handleConnectivityUpdate}>
        <Stack gap="lg" mt="lg">
          {enabledApiProviders.has("AWS_BEDROCK") && (
            <Paper withBorder p="md">
              <Group justify="space-between" align="center">
                <Title order={3}>{t("connectivity.awsBedrock")}</Title>
                <ActionIcon
                  variant="subtle"
                  onClick={() => setAwsHelpOpen(!awsHelpOpen)}
                  aria-label={t("connectivity.toggleHelp")}
                >
                  <IconHelp size={16} />
                </ActionIcon>
              </Group>
              <Group my="md">
                {apiProvidersCredSource["AWS_BEDROCK"] && (
                  <Badge color="blue">
                    {t("connectivity.source", { source: apiProvidersCredSource["AWS_BEDROCK"] })}
                  </Badge>
                )}
                <Switch
                  checked={awsBedrockServerSave}
                  onChange={toggleServerSave("AWS_BEDROCK")}
                  label={t("connectivity.storeOnServer")}
                />
              </Group>

              <Collapse in={awsHelpOpen}>
                <Paper p="sm" bg="gray.4" mb="md">
                  <Text size="sm" c="dark.5">
                    <strong>{t("connectivity.awsHowTo")}</strong>
                  </Text>
                  <Text size="sm" c="dark.5">
                    {t("connectivity.awsStep1")}
                    <br />
                    {t("connectivity.awsStep2")}
                    <br />
                    {t("connectivity.awsStep3")}
                    <br />
                    {t("connectivity.awsStep4")}
                    <br />
                    {t("connectivity.awsStep5")}
                    <br />
                    {t("connectivity.awsStep6")}
                    <br />
                    {t("connectivity.awsStep7")}
                  </Text>
                </Paper>
              </Collapse>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label={t("connectivity.awsRegion")}
                  autoComplete="off"
                  value={awsRegion}
                  onChange={e => setAwsRegion(e.target.value)}
                  placeholder="us-east-1"
                />
                <TextInput
                  label={t("connectivity.awsProfile")}
                  autoComplete="off"
                  value={awsProfile}
                  onChange={e => setAwsProfile(e.target.value)}
                  placeholder="default"
                />
                <PasswordInput
                  label={t("connectivity.awsAccessKeyId")}
                  autoComplete="off"
                  value={awsAccessKeyId}
                  onChange={e => setAwsAccessKeyId(e.target.value)}
                  placeholder="AKIA..."
                />
                <PasswordInput
                  label={t("connectivity.awsSecretAccessKey")}
                  autoComplete="off"
                  value={awsSecretAccessKey}
                  onChange={e => setAwsSecretAccessKey(e.target.value)}
                  placeholder="..."
                />
              </SimpleGrid>
            </Paper>
          )}
          {enabledApiProviders.has("OPEN_AI") && (
            <Paper withBorder p="md">
              <Group justify="space-between" align="center">
                <Title order={3}>{t("connectivity.openai")}</Title>
                <ActionIcon
                  variant="subtle"
                  onClick={() => setOpenaiHelpOpen(!openaiHelpOpen)}
                  aria-label={t("connectivity.toggleHelp")}
                >
                  <IconHelp size={16} />
                </ActionIcon>
              </Group>
              <Group my="md">
                {apiProvidersCredSource["OPEN_AI"] && (
                  <Badge color="blue">{t("connectivity.source", { source: apiProvidersCredSource["OPEN_AI"] })}</Badge>
                )}
                <Switch
                  checked={openAiServerSave}
                  onChange={toggleServerSave("OPEN_AI")}
                  label={t("connectivity.storeOnServer")}
                />
              </Group>

              <Collapse in={openaiHelpOpen}>
                <Paper p="sm" bg="gray.4" mb="md">
                  <Text size="sm" c="dark.5">
                    <strong>{t("connectivity.openaiHowTo")}</strong>
                  </Text>
                  <Text size="sm" c="dark.5">
                    {t("connectivity.openaiStep1")}
                    <br />
                    {t("connectivity.openaiStep2")}
                    <br />
                    {t("connectivity.openaiStep3")}
                    <br />
                    {t("connectivity.openaiStep4")}
                    <br />
                    {t("connectivity.openaiStep5")}
                    <br />
                    {t("connectivity.openaiStep6")}
                  </Text>
                </Paper>
              </Collapse>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <PasswordInput
                  label={t("connectivity.openaiApiKey")}
                  autoComplete="off"
                  value={openaiApiKey}
                  onChange={e => setOpenaiApiKey(e.target.value)}
                  placeholder="sk-..."
                />
                <PasswordInput
                  label={t("connectivity.openaiApiAdminKey")}
                  autoComplete="off"
                  value={openaiApiAdminKey}
                  onChange={e => setOpenaiApiAdminKey(e.target.value)}
                  placeholder="sk-..."
                />
              </SimpleGrid>
            </Paper>
          )}

          {enabledApiProviders.has("YANDEX_FM") && (
            <Paper withBorder p="md">
              <Group justify="space-between" align="center">
                <Title order={3}>{t("connectivity.yandex")}</Title>

                <ActionIcon
                  variant="subtle"
                  onClick={() => setYandexHelpOpen(!yandexHelpOpen)}
                  aria-label={t("connectivity.toggleHelp")}
                >
                  <IconHelp size={16} />
                </ActionIcon>
              </Group>
              <Group my="md">
                {apiProvidersCredSource["YANDEX_FM"] && (
                  <Badge color="blue">
                    {t("connectivity.source", { source: apiProvidersCredSource["YANDEX_FM"] })}
                  </Badge>
                )}
                <Switch
                  checked={yandexFmServerSave}
                  onChange={toggleServerSave("YANDEX_FM")}
                  label={t("connectivity.storeOnServer")}
                />
              </Group>

              <Collapse in={yandexHelpOpen}>
                <Paper p="sm" bg="gray.4" mb="md">
                  <Text size="sm" c="dark.5">
                    <strong>{t("connectivity.yandexHowTo")}</strong>
                  </Text>
                  <Text size="sm" c="dark.5">
                    {t("connectivity.yandexStep1")}
                    <br />
                    {t("connectivity.yandexStep2")}
                    <br />
                    {t("connectivity.yandexStep3")}
                    <br />
                    {t("connectivity.yandexStep4")}
                    <br />
                    {t("connectivity.yandexStep5")}
                    <br />
                    {t("connectivity.yandexStep6")}
                  </Text>
                </Paper>
              </Collapse>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <PasswordInput
                  label={t("connectivity.yandexApiKey")}
                  autoComplete="off"
                  value={yandexApiKey}
                  onChange={e => setYandexApiKey(e.target.value)}
                  placeholder="AQVN..."
                />
                <PasswordInput
                  label={t("connectivity.yandexApiFolderId")}
                  autoComplete="off"
                  value={yandexApiFolderId}
                  onChange={e => setYandexApiFolderId(e.target.value)}
                  placeholder="b1g..."
                />
              </SimpleGrid>
            </Paper>
          )}

          {/* S3 Configuration */}
          <Paper withBorder p="md">
            {appConfig?.s3Connected && (
              <Alert color="green" mb="md">
                {t("connectivity.s3Connected")}
              </Alert>
            )}
            <Group justify="space-between" align="center">
              <Title order={3}>{t("connectivity.s3FileStorage")}</Title>
              <ActionIcon
                variant="subtle"
                onClick={() => setS3HelpOpen(!s3HelpOpen)}
                aria-label={t("connectivity.toggleHelp")}
              >
                <IconHelp size={16} />
              </ActionIcon>
            </Group>
            <Group my="md">
              {apiProvidersCredSource["S3"] && (
                <Badge color="blue">{t("connectivity.source", { source: apiProvidersCredSource["S3"] })}</Badge>
              )}
            </Group>

            <Collapse in={s3HelpOpen}>
              <Paper p="sm" bg="gray.4" mb="md">
                <Text size="sm" c="dark.5">
                  <strong>{t("connectivity.s3HowTo")}</strong>
                </Text>
                <Text size="sm" c="dark.5">
                  <strong>AWS S3:</strong>
                  <br />
                  1. Create an S3 bucket in AWS Console
                  <br />
                  2. Endpoint: https://s3.amazonaws.com or https://s3.&lt;region&gt;.amazonaws.com
                  <br />
                  3. Use your AWS credentials (Access Key ID and Secret)
                  <br />
                  4. Set appropriate bucket permissions
                  <br />
                  <br />
                  <strong>MinIO (local development):</strong>
                  <br />
                  1. Install and run MinIO server
                  <br />
                  2. Endpoint: http://localhost:9000 (or your MinIO URL)
                  <br />
                  3. Use MinIO root credentials or created user credentials
                  <br />
                  4. Create a bucket through MinIO Console
                  <br />
                  <br />
                  <strong>Other S3-compatible services:</strong>
                  <br />
                  DigitalOcean Spaces, Backblaze B2, etc. - use their respective endpoints and credentials
                </Text>
              </Paper>
            </Collapse>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <TextInput
                label={t("connectivity.s3Endpoint")}
                autoComplete="off"
                value={s3Endpoint}
                onChange={e => setS3Endpoint(e.target.value)}
                placeholder="https://s3.amazonaws.com or http://localhost:9000"
              />
              <TextInput
                label={t("connectivity.s3Region")}
                autoComplete="off"
                value={s3Region}
                onChange={e => setS3Region(e.target.value)}
                placeholder="us-east-1"
              />
              <PasswordInput
                label={t("connectivity.s3AccessKeyId")}
                autoComplete="off"
                value={s3AccessKeyId}
                onChange={e => setS3AccessKeyId(e.target.value)}
                placeholder="AKIA... or minioadmin"
              />
              <PasswordInput
                label={t("connectivity.s3SecretAccessKey")}
                autoComplete="off"
                value={s3SecretAccessKey}
                onChange={e => setS3SecretAccessKey(e.target.value)}
                placeholder="Secret key or minioadmin"
              />
            </SimpleGrid>
            <TextInput
              label={t("connectivity.s3FilesBucketName")}
              autoComplete="off"
              value={s3FilesBucketName}
              onChange={e => setS3FilesBucketName(e.target.value)}
              placeholder="my-files-bucket"
            />
          </Paper>
        </Stack>
      </form>
      <Group justify="right" mt="md">
        <Button type="submit" loading={updateLoading} onClick={handleConnectivityUpdate}>
          {t("common.save")}
        </Button>
      </Group>
    </Stack>
  );
};
