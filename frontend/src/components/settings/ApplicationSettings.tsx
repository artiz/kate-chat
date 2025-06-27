import React, { useState, useEffect, useMemo } from "react";
import { gql, useMutation, useQuery } from "@apollo/client";
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
  SegmentedControl,
  Textarea,
  Tabs,
  Collapse,
  ActionIcon,
  Box,
  SimpleGrid,
} from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconHelp } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useAppSelector, useAppDispatch } from "@/store";
import { useTheme } from "@/hooks/useTheme";
import { setUser } from "@/store/slices/userSlice";
import {
  STORAGE_AWS_BEDROCK_ACCESS_KEY_ID,
  STORAGE_AWS_BEDROCK_PROFILE,
  STORAGE_AWS_BEDROCK_REGION,
  STORAGE_AWS_BEDROCK_SECRET_ACCESS_KEY,
  STORAGE_OPENAI_API_ADMIN_KEY,
  STORAGE_OPENAI_API_KEY,
  STORAGE_YANDEX_FM_API_FOLDER_ID,
  STORAGE_YANDEX_FM_API_KEY,
  STORAGE_S3_ENDPOINT,
  STORAGE_S3_REGION,
  STORAGE_S3_ACCESS_KEY_ID,
  STORAGE_S3_SECRET_ACCESS_KEY,
  STORAGE_S3_FILES_BUCKET_NAME,
} from "@/store/slices/authSlice";
import { ApiProvider } from "@/types/ai";

interface IProps {
  onReloadAppData?: () => void;
}

type ColorScheme = "light" | "dark" | "auto";

// GraphQL mutations and queries
const UPDATE_USER_MUTATION = gql`
  mutation UpdateUser($input: UpdateUserInput!) {
    updateUser(input: $input) {
      id
      email
      firstName
      lastName
      defaultModelId
      defaultSystemPrompt
    }
  }
`;

const CHANGE_PASSWORD_MUTATION = gql`
  mutation ChangePassword($input: ChangePasswordInput!) {
    changePassword(input: $input) {
      success
    }
  }
`;

export const ApplicationSettings: React.FC<IProps> = ({ onReloadAppData }: IProps) => {
  const { currentUser: user, appConfig } = useAppSelector(state => state.user);
  const { models, providers } = useAppSelector(state => state.models);
  const dispatch = useAppDispatch();

  // User profile form state
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [email, setEmail] = useState(user?.email || "");
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
  const [s3HelpOpen, setS3HelpOpen] = useState(false);

  const enabledApiProviders: Set<ApiProvider> = useMemo(() => {
    return new Set(providers.map(provider => provider.id as ApiProvider));
  }, [providers]);

  const isLocalUser = useMemo(() => {
    return !user?.googleId && !user?.githubId;
  }, [user]);

  useEffect(() => {
    // Load initial connection settings from localStorage or defaults
    if (enabledApiProviders.has("aws_bedrock")) {
      setAwsRegion(localStorage.getItem(STORAGE_AWS_BEDROCK_REGION) || "");
      setAwsProfile(localStorage.getItem(STORAGE_AWS_BEDROCK_PROFILE) || "");
      setAwsAccessKeyId(localStorage.getItem(STORAGE_AWS_BEDROCK_ACCESS_KEY_ID) || "");
      setAwsSecretAccessKey(localStorage.getItem(STORAGE_AWS_BEDROCK_SECRET_ACCESS_KEY) || "");
    }
    if (enabledApiProviders.has("open_ai")) {
      setOpenaiApiKey(localStorage.getItem(STORAGE_OPENAI_API_KEY) || "");
      setOpenaiApiAdminKey(localStorage.getItem(STORAGE_OPENAI_API_ADMIN_KEY) || "");
    }
    if (enabledApiProviders.has("yandex_fm")) {
      setYandexApiKey(localStorage.getItem(STORAGE_YANDEX_FM_API_KEY) || "");
      setYandexApiFolderId(localStorage.getItem(STORAGE_YANDEX_FM_API_FOLDER_ID) || "");
    }
    // Load S3 settings
    setS3Endpoint(localStorage.getItem(STORAGE_S3_ENDPOINT) || "");
    setS3Region(localStorage.getItem(STORAGE_S3_REGION) || "");
    setS3AccessKeyId(localStorage.getItem(STORAGE_S3_ACCESS_KEY_ID) || "");
    setS3SecretAccessKey(localStorage.getItem(STORAGE_S3_SECRET_ACCESS_KEY) || "");
    setS3FilesBucketName(localStorage.getItem(STORAGE_S3_FILES_BUCKET_NAME) || "");
  }, [user, enabledApiProviders]);

  // Update when user changes
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setEmail(user.email || "");
      setDefaultModelId(user.defaultModelId || "");
      setDefaultSystemPrompt(user.defaultSystemPrompt || "");
    }
  }, [user]);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI preferences state
  const { colorScheme, setColorScheme } = useTheme();

  // Update user mutation
  const [updateUser, { loading: updateLoading }] = useMutation(UPDATE_USER_MUTATION, {
    onCompleted: data => {
      // Update the user in the Redux store
      if (data?.updateUser) {
        dispatch(setUser(data.updateUser));
      }

      notifications.show({
        title: "Profile Updated",
        message: "Your profile information has been updated successfully",
        color: "green",
      });
    },
    onError: error => {
      notifications.show({
        title: "Update Failed",
        message: error.message || "Failed to update profile",
        color: "red",
      });
    },
  });

  // Change password mutation
  const [changePassword, { loading: passwordLoading }] = useMutation(CHANGE_PASSWORD_MUTATION, {
    onCompleted: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      notifications.show({
        title: "Password Changed",
        message: "Your password has been changed successfully",
        color: "green",
      });
    },
    onError: error => {
      notifications.show({
        title: "Password Change Failed",
        message: error.message || "Failed to change password",
        color: "red",
      });
    },
  });

  // Handle profile update
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    await updateUser({
      variables: {
        input: {
          firstName,
          lastName,
          email,
        },
      },
    });
  };

  // Handle default model and system prompt update
  const handleUserDefaultsUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    await updateUser({
      variables: {
        input: {
          defaultModelId,
          defaultSystemPrompt,
        },
      },
    });
  };

  const handleConnectivityUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(STORAGE_AWS_BEDROCK_REGION, awsRegion || "");
    localStorage.setItem(STORAGE_AWS_BEDROCK_PROFILE, awsProfile || "");
    localStorage.setItem(STORAGE_AWS_BEDROCK_ACCESS_KEY_ID, awsAccessKeyId || "");
    localStorage.setItem(STORAGE_AWS_BEDROCK_SECRET_ACCESS_KEY, awsSecretAccessKey || "");
    localStorage.setItem(STORAGE_OPENAI_API_KEY, openaiApiKey || "");
    localStorage.setItem(STORAGE_OPENAI_API_ADMIN_KEY, openaiApiAdminKey || "");
    localStorage.setItem(STORAGE_YANDEX_FM_API_KEY, yandexApiKey || "");
    localStorage.setItem(STORAGE_YANDEX_FM_API_FOLDER_ID, yandexApiFolderId || "");
    localStorage.setItem(STORAGE_S3_ENDPOINT, s3Endpoint || "");
    localStorage.setItem(STORAGE_S3_REGION, s3Region || "");
    localStorage.setItem(STORAGE_S3_ACCESS_KEY_ID, s3AccessKeyId || "");
    localStorage.setItem(STORAGE_S3_SECRET_ACCESS_KEY, s3SecretAccessKey || "");
    localStorage.setItem(STORAGE_S3_FILES_BUCKET_NAME, s3FilesBucketName || "");

    onReloadAppData?.();
  };

  // Handle password change
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      notifications.show({
        title: "Password Mismatch",
        message: "New password and confirmation do not match",
        color: "red",
      });
      return;
    }

    await changePassword({
      variables: {
        input: {
          currentPassword,
          newPassword,
        },
      },
    });
  };

  const handleThemeUpdate = (val: string) => {
    const value = val as ColorScheme;
    setColorScheme(value);
    // Also update the document element directly
    if (value === "auto") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.mantine = prefersDark ? "dark" : "light";
    } else {
      document.documentElement.dataset.mantine = value;
    }
  };

  const modelSelectData = models
    .filter(model => model.isActive)
    .map(model => ({
      value: model.modelId,
      label: model.name,
    }));

  if (!user) return null;

  return (
    <Tabs defaultValue="ai">
      <Tabs.List mb="md">
        <Tabs.Tab value="ai">AI Settings</Tabs.Tab>
        <Tabs.Tab value="profile">Profile Settings</Tabs.Tab>
        {isLocalUser && <Tabs.Tab value="password">Password</Tabs.Tab>}
      </Tabs.List>

      <Tabs.Panel value="ai">
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
                      label="AWS profile"
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
                        3. Go to Service accounts and create a new service account
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
        <Paper withBorder p="xl" mt="lg">
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
      </Tabs.Panel>

      <Tabs.Panel value="profile">
        {/* Profile Settings */}
        <Paper withBorder p="xl">
          <form name="profile-settings" onSubmit={handleProfileUpdate}>
            <Stack gap="md" mb="lg">
              <Text mb="xs">Theme</Text>
              <SegmentedControl
                value={colorScheme}
                onChange={handleThemeUpdate}
                data={[
                  { label: "Light", value: "light" },
                  { label: "Dark", value: "dark" },
                  { label: "Auto", value: "auto" },
                ]}
                fullWidth
              />
            </Stack>

            <Stack gap="md">
              <Group grow>
                <TextInput label="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} required />
                <TextInput label="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} required />
              </Group>

              <TextInput
                label="Email"
                disabled={!isLocalUser}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />

              <Group justify="right" mt="md">
                <Button type="submit" loading={updateLoading}>
                  Save Profile
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Tabs.Panel>

      {isLocalUser && (
        <Tabs.Panel value="password">
          {/* Password Settings */}
          <Paper withBorder p="xl">
            <form name="password-settings" onSubmit={handlePasswordChange}>
              <Stack gap="md">
                <PasswordInput
                  label="Current Password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                />

                <Divider my="sm" />

                <PasswordInput
                  label="New Password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                />

                <PasswordInput
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                />

                <Group justify="right" mt="md">
                  <Button type="submit" loading={passwordLoading}>
                    Change Password
                  </Button>
                </Group>
              </Stack>
            </form>
          </Paper>
        </Tabs.Panel>
      )}
    </Tabs>
  );
};
