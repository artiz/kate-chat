import React, { useState, useEffect, useMemo } from "react";
import {
  Title,
  Paper,
  TextInput,
  PasswordInput,
  Button,
  Group,
  Stack,
  Divider,
  Select,
  Text,
  Textarea,
  Collapse,
  ActionIcon,
  SimpleGrid,
  Alert,
  Switch,
} from "@mantine/core";
import { IconHelp } from "@tabler/icons-react";
import { useAppSelector, useAppDispatch } from "@/store";
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
import { ApiProvider } from "@/types/ai";
import { ModelType } from "@/store/slices/modelSlice";

interface AISettingsProps {
  user: User;
  updateLoading?: boolean;
  updateUser: (input: UpdateUserInput) => Promise<void>;
}

export const AISettings: React.FC<AISettingsProps> = ({ user, updateUser, updateLoading }) => {
  const { appConfig } = useAppSelector(state => state.user);
  const { models, providers } = useAppSelector(state => state.models);

  // Default settings form state
  const [defaultModelId, setDefaultModelId] = useState(user?.defaultModelId || "");
  const [defaultSystemPrompt, setDefaultSystemPrompt] = useState(user?.defaultSystemPrompt || "");

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

  useEffect(() => {
    const settings = user?.settings || {};
    // Load initial connection settings from localStorage or defaults
    if (enabledApiProviders.has("aws_bedrock")) {
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
    if (enabledApiProviders.has("open_ai")) {
      setOpenaiApiKey(localStorage.getItem(STORAGE_OPENAI_API_KEY) || settings.openaiApiKey || "");
      setOpenaiApiAdminKey(localStorage.getItem(STORAGE_OPENAI_API_ADMIN_KEY) || settings.openaiApiAdminKey || "");

      setOpenAiServerSave(Boolean(settings.openaiApiKey || settings.openaiApiAdminKey));
    }
    if (enabledApiProviders.has("yandex_fm")) {
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
  }, [user, enabledApiProviders]);

  // Update when user changes
  useEffect(() => {
    if (user) {
      setDefaultModelId(user.defaultModelId || "");
      setDefaultSystemPrompt(user.defaultSystemPrompt || "");
    }
  }, [user]);

  // Handle default model and system prompt update
  const handleUserDefaultsUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateUser({
      defaultModelId,
      defaultSystemPrompt,
    });
  };

  const toggleServerSave = (provider: ApiProvider): React.ChangeEventHandler<HTMLInputElement> | undefined => {
    switch (provider) {
      case "aws_bedrock":
        return event => setAwsBedrockServerSave(event.currentTarget.checked);
      case "open_ai":
        return event => setOpenAiServerSave(event.currentTarget.checked);
      case "yandex_fm":
        return event => setYandexFmServerSave(event.currentTarget.checked);
      default:
        return undefined;
    }
  };

  const handleConnectivityUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(STORAGE_AWS_BEDROCK_REGION, awsRegion || "");
    localStorage.setItem(STORAGE_AWS_BEDROCK_PROFILE, awsProfile || "");
    localStorage.setItem(STORAGE_AWS_BEDROCK_ACCESS_KEY_ID, awsAccessKeyId || "");
    localStorage.setItem(STORAGE_AWS_BEDROCK_SECRET_ACCESS_KEY, awsSecretAccessKey || "");
    localStorage.setItem(STORAGE_OPENAI_API_KEY, openaiApiKey || "");
    localStorage.setItem(STORAGE_OPENAI_API_ADMIN_KEY, openaiApiAdminKey || "");
    localStorage.setItem(STORAGE_YANDEX_FM_API_KEY, yandexApiKey || "");
    localStorage.setItem(STORAGE_YANDEX_FM_API_FOLDER, yandexApiFolderId || "");

    const settings: UserSettings = {
      s3Endpoint: s3Endpoint || "",
      s3Region: s3Region || "",
      s3AccessKeyId: s3AccessKeyId || "",
      s3SecretAccessKey: s3SecretAccessKey || "",
      s3FilesBucketName: s3FilesBucketName || "",

      awsBedrockRegion: awsBedrockServerSave ? awsRegion : "",
      awsBedrockProfile: awsBedrockServerSave ? awsProfile : "",
      awsBedrockAccessKeyId: awsBedrockServerSave ? awsAccessKeyId : "",
      awsBedrockSecretAccessKey: awsBedrockServerSave ? awsSecretAccessKey : "",
      openaiApiKey: openAiServerSave ? openaiApiKey : "",
      openaiApiAdminKey: openAiServerSave ? openaiApiAdminKey : "",
      yandexFmApiKey: yandexFmServerSave ? yandexApiKey : "",
      yandexFmApiFolderId: yandexFmServerSave ? yandexApiFolderId : "",
    };

    await updateUser({
      settings,
    });
  };

  const modelSelectData = models
    .filter(model => model.isActive && model.type !== ModelType.EMBEDDING)
    .map(model => ({
      value: model.modelId,
      label: model.name,
    }));

  if (!user) return null;

  return (
    <Stack gap="lg">
      {/* Connectivity */}
      <Paper withBorder p="xl">
        <form name="connectivity-settings" onSubmit={handleConnectivityUpdate}>
          <Stack gap="sm">
            {enabledApiProviders.has("aws_bedrock") && (
              <>
                <Group justify="space-between" align="center">
                  <Title order={3}>AWS Bedrock</Title>
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setAwsHelpOpen(!awsHelpOpen)}
                    aria-label="Toggle AWS Bedrock help"
                  >
                    <IconHelp size={16} />
                  </ActionIcon>
                </Group>
                <Switch
                  checked={awsBedrockServerSave}
                  onChange={toggleServerSave("aws_bedrock")}
                  label="Store on server (to use on other devices)"
                />

                <Collapse in={awsHelpOpen}>
                  <Paper p="sm" bg="gray.4" mb="md">
                    <Text size="sm" c="dark.5">
                      <strong>How to get AWS Bedrock credentials:</strong>
                    </Text>
                    <Text size="sm" mt="xs" c="dark.5">
                      1. Sign in to the AWS Management Console
                      <br />
                      2. Go to IAM (Identity and Access Management)
                      <br />
                      3. Create a new user or use existing one
                      <br />
                      4. Attach the "AmazonBedrockFullAccess" policy
                      <br />
                      5. Generate access keys in Security credentials tab
                      <br />
                      6. Choose your preferred AWS region (e.g., us-east-1, us-west-2)
                      <br />
                      7. Optionally configure AWS profile in ~/.aws/credentials
                    </Text>
                  </Paper>
                </Collapse>

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <TextInput
                    label="AWS region"
                    autoComplete="off"
                    value={awsRegion}
                    onChange={e => setAwsRegion(e.target.value)}
                    placeholder="us-east-1"
                  />
                  <TextInput
                    label="AWS profile (useful on local dev env)"
                    autoComplete="off"
                    value={awsProfile}
                    onChange={e => setAwsProfile(e.target.value)}
                    placeholder="default"
                  />
                  <PasswordInput
                    label="AWS access key ID"
                    autoComplete="off"
                    value={awsAccessKeyId}
                    onChange={e => setAwsAccessKeyId(e.target.value)}
                    placeholder="AKIA..."
                  />
                  <PasswordInput
                    label="AWS secret access key"
                    autoComplete="off"
                    value={awsSecretAccessKey}
                    onChange={e => setAwsSecretAccessKey(e.target.value)}
                    placeholder="..."
                  />
                </SimpleGrid>

                <Divider />
              </>
            )}
            {enabledApiProviders.has("open_ai") && (
              <>
                <Group justify="space-between" align="center">
                  <Title order={3}>OpenAI</Title>
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setOpenaiHelpOpen(!openaiHelpOpen)}
                    aria-label="Toggle OpenAI help"
                  >
                    <IconHelp size={16} />
                  </ActionIcon>
                </Group>
                <Switch
                  checked={openAiServerSave}
                  onChange={toggleServerSave("open_ai")}
                  label="Store on server (to use on other devices)"
                />

                <Collapse in={openaiHelpOpen}>
                  <Paper p="sm" bg="gray.4" mb="md">
                    <Text size="sm" c="dark.5">
                      <strong>How to get OpenAI API keys:</strong>
                    </Text>
                    <Text size="sm" c="dark.5">
                      1. Sign up or log in to OpenAI Platform (platform.openai.com)
                      <br />
                      2. Navigate to API keys section in your account
                      <br />
                      3. Click "Create new secret key"
                      <br />
                      4. Copy and store the key securely
                      <br />
                      5. Set usage limits and billing information as needed
                      <br />
                      6. Admin key is optional and used for organization management
                    </Text>
                  </Paper>
                </Collapse>

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <PasswordInput
                    label="OpenAI API Key"
                    autoComplete="off"
                    value={openaiApiKey}
                    onChange={e => setOpenaiApiKey(e.target.value)}
                    placeholder="sk-..."
                  />
                  <PasswordInput
                    label="OpenAI API Admin Key"
                    autoComplete="off"
                    value={openaiApiAdminKey}
                    onChange={e => setOpenaiApiAdminKey(e.target.value)}
                    placeholder="sk-..."
                  />
                </SimpleGrid>
                <Divider />
              </>
            )}

            {enabledApiProviders.has("yandex_fm") && (
              <>
                <Group justify="space-between" align="center">
                  <Title order={3}>Yandex Foundational Models</Title>

                  <ActionIcon
                    variant="subtle"
                    onClick={() => setYandexHelpOpen(!yandexHelpOpen)}
                    aria-label="Toggle Yandex help"
                  >
                    <IconHelp size={16} />
                  </ActionIcon>
                </Group>
                <Switch
                  checked={yandexFmServerSave}
                  onChange={toggleServerSave("yandex_fm")}
                  label="Store on server (to use on other devices)"
                />

                <Collapse in={yandexHelpOpen}>
                  <Paper p="sm" bg="gray.4" mb="md">
                    <Text size="sm" c="dark.5">
                      <strong>How to get Yandex Cloud credentials:</strong>
                    </Text>
                    <Text size="sm" c="dark.5">
                      1. Sign up for Yandex Cloud (cloud.yandex.com)
                      <br />
                      2. Create or select a folder in your cloud
                      <br />
                      3. Go to Identity and Access Management/Service accounts and create a new service account
                      <br />
                      4. Assign the "ai.models.user" role to the service account
                      <br />
                      5. Create an API key for the service account
                      <br />
                      6. Copy the folder ID from the folder overview page
                    </Text>
                  </Paper>
                </Collapse>

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <PasswordInput
                    label="Yandex API Key"
                    autoComplete="off"
                    value={yandexApiKey}
                    onChange={e => setYandexApiKey(e.target.value)}
                    placeholder="AQVN..."
                  />
                  <PasswordInput
                    label="Yandex API Folder ID"
                    autoComplete="off"
                    value={yandexApiFolderId}
                    onChange={e => setYandexApiFolderId(e.target.value)}
                    placeholder="b1g..."
                  />
                </SimpleGrid>
              </>
            )}

            {/* S3 Configuration */}
            <Divider />
            {appConfig?.s3Connected && (
              <Alert color="green" mb="md">
                S3 storage is connected on backend and ready to use. You could override these settings below, they will
                be stored in your profile to make uploaded/generated images available everywhere.
              </Alert>
            )}
            <Group justify="space-between" align="center">
              <Title order={3}>S3 File Storage</Title>
              <ActionIcon variant="subtle" onClick={() => setS3HelpOpen(!s3HelpOpen)} aria-label="Toggle S3 help">
                <IconHelp size={16} />
              </ActionIcon>
            </Group>

            <Collapse in={s3HelpOpen}>
              <Paper p="sm" bg="gray.4" mb="md">
                <Text size="sm" c="dark.5">
                  <strong>How to configure S3 storage:</strong>
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
                label="S3 Endpoint"
                autoComplete="off"
                value={s3Endpoint}
                onChange={e => setS3Endpoint(e.target.value)}
                placeholder="https://s3.amazonaws.com or http://localhost:9000"
              />
              <TextInput
                label="S3 Region"
                autoComplete="off"
                value={s3Region}
                onChange={e => setS3Region(e.target.value)}
                placeholder="us-east-1"
              />
              <PasswordInput
                label="S3 Access Key ID"
                autoComplete="off"
                value={s3AccessKeyId}
                onChange={e => setS3AccessKeyId(e.target.value)}
                placeholder="AKIA... or minioadmin"
              />
              <PasswordInput
                label="S3 Secret Access Key"
                autoComplete="off"
                value={s3SecretAccessKey}
                onChange={e => setS3SecretAccessKey(e.target.value)}
                placeholder="Secret key or minioadmin"
              />
            </SimpleGrid>
            <TextInput
              label="S3 Files Bucket Name"
              autoComplete="off"
              value={s3FilesBucketName}
              onChange={e => setS3FilesBucketName(e.target.value)}
              placeholder="my-files-bucket"
            />

            <Group justify="right" mt="md">
              <Button type="submit" loading={updateLoading}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>

      {/* Default Settings */}
      <Paper withBorder p="xl">
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

            <Group justify="right" mt="md">
              <Button type="submit" loading={updateLoading}>
                Save Defaults
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
};
