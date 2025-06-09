import React, { useState, useEffect } from "react";
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
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAppSelector, useAppDispatch } from "@/store";
import { useTheme } from "@/hooks/useTheme";
import { setUser } from "@/store/slices/userSlice";
import {
  STORAGE_AWS_ACCESS_KEY_ID,
  STORAGE_AWS_PROFILE,
  STORAGE_AWS_REGION,
  STORAGE_AWS_SECRET_ACCESS_KEY,
  STORAGE_OPENAI_API_ADMIN_KEY,
  STORAGE_OPENAI_API_KEY,
  STORAGE_YANDEX_API_FOLDER_ID,
  STORAGE_YANDEX_API_KEY,
} from "@/store/slices/authSlice";

interface IProps {
  onReloadAppData?: () => void;
}

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
  const user = useAppSelector(state => state.user.currentUser);
  const models = useAppSelector(state => state.models.models);
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

  useEffect(() => {
    // Load initial connection settings from localStorage or defaults
    setAwsRegion(localStorage.getItem(STORAGE_AWS_REGION) || "");
    setAwsProfile(localStorage.getItem(STORAGE_AWS_PROFILE) || "");
    setAwsAccessKeyId(localStorage.getItem(STORAGE_AWS_ACCESS_KEY_ID) || "");
    setAwsSecretAccessKey(localStorage.getItem(STORAGE_AWS_SECRET_ACCESS_KEY) || "");
    setOpenaiApiKey(localStorage.getItem(STORAGE_OPENAI_API_KEY) || "");
    setOpenaiApiAdminKey(localStorage.getItem(STORAGE_OPENAI_API_ADMIN_KEY) || "");
    setYandexApiKey(localStorage.getItem(STORAGE_YANDEX_API_KEY) || "");
    setYandexApiFolderId(localStorage.getItem(STORAGE_YANDEX_API_FOLDER_ID) || "");
  }, [user]);

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
  const [language, setLanguage] = useState("en");

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
    localStorage.setItem(STORAGE_AWS_REGION, awsRegion || "");
    localStorage.setItem(STORAGE_AWS_PROFILE, awsProfile || "");
    localStorage.setItem(STORAGE_AWS_ACCESS_KEY_ID, awsAccessKeyId || "");
    localStorage.setItem(STORAGE_AWS_SECRET_ACCESS_KEY, awsSecretAccessKey || "");
    localStorage.setItem(STORAGE_OPENAI_API_KEY, openaiApiKey || "");
    localStorage.setItem(STORAGE_OPENAI_API_ADMIN_KEY, openaiApiAdminKey || "");
    localStorage.setItem(STORAGE_YANDEX_API_KEY, yandexApiKey || "");
    localStorage.setItem(STORAGE_YANDEX_API_FOLDER_ID, yandexApiFolderId || "");

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

  // Handle UI preferences
  const handleUiPreferencesUpdate = () => {
    // Theme preference is saved automatically via localStorage
    notifications.show({
      title: "Preferences Saved",
      message: "Your UI preferences have been updated",
      color: "green",
    });
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
        <Tabs.Tab value="ui">UI Preferences</Tabs.Tab>
        <Tabs.Tab value="profile">Profile Settings</Tabs.Tab>
        <Tabs.Tab value="password">Password</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="ai">
        {/* Connectivity */}
        <Paper withBorder p="xl">
          <form name="connectivity-settings" onSubmit={handleConnectivityUpdate}>
            <Stack gap="md">
              <Title order={3}>AWS Bedrock</Title>
              <TextInput
                label="AWS region"
                autoComplete="off"
                value={awsRegion}
                onChange={e => setAwsRegion(e.target.value)}
              />
              <TextInput
                label="AWS profile"
                autoComplete="off"
                value={awsProfile}
                onChange={e => setAwsProfile(e.target.value)}
              />
              <PasswordInput
                label="AWS access key ID"
                autoComplete="off"
                value={awsAccessKeyId}
                onChange={e => setAwsAccessKeyId(e.target.value)}
              />
              <PasswordInput
                label="AWS secret access key"
                autoComplete="off"
                value={awsSecretAccessKey}
                onChange={e => setAwsSecretAccessKey(e.target.value)}
              />

              <Divider />

              <Title order={3}>Open AI</Title>
              <PasswordInput
                label="OpenAI API Key"
                autoComplete="off"
                value={openaiApiKey}
                onChange={e => setOpenaiApiKey(e.target.value)}
              />
              <PasswordInput
                label="OpenAI API Admin Key"
                autoComplete="off"
                value={openaiApiAdminKey}
                onChange={e => setOpenaiApiAdminKey(e.target.value)}
              />
              <Divider />

              <Title order={3}>Yandex Foundational Models</Title>
              <PasswordInput
                label="Yandex API Key"
                autoComplete="off"
                value={yandexApiKey}
                onChange={e => setYandexApiKey(e.target.value)}
              />
              <PasswordInput
                label="Yandex API Folder ID"
                autoComplete="off"
                value={yandexApiFolderId}
                onChange={e => setYandexApiFolderId(e.target.value)}
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
      </Tabs.Panel>

      <Tabs.Panel value="profile">
        {/* Profile Settings */}
        <Paper withBorder p="xl">
          <form name="profile-settings" onSubmit={handleProfileUpdate}>
            <Stack gap="md">
              <Group grow>
                <TextInput label="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} required />
                <TextInput label="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} required />
              </Group>

              <TextInput label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />

              <Group justify="right" mt="md">
                <Button type="submit" loading={updateLoading}>
                  Save Profile
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Tabs.Panel>

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

      <Tabs.Panel value="ui">
        {/* UI Preferences */}
        <Paper withBorder p="xl">
          <Stack gap="md">
            <div>
              <Text mb="xs">Theme</Text>
              <SegmentedControl
                value={colorScheme}
                onChange={value => {
                  const newValue = value as "light" | "dark" | "auto";
                  setColorScheme(newValue);

                  // Also update the document element directly
                  if (newValue === "auto") {
                    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                    document.documentElement.dataset.mantine = prefersDark ? "dark" : "light";
                  } else {
                    document.documentElement.dataset.mantine = newValue;
                  }
                }}
                data={[
                  { label: "Light", value: "light" },
                  { label: "Dark", value: "dark" },
                  { label: "Auto", value: "auto" },
                ]}
                fullWidth
              />
            </div>

            <Select
              label="Language"
              value={language}
              onChange={value => setLanguage(value as string)}
              data={[
                { value: "en", label: "English" },
                { value: "es", label: "Spanish" },
                { value: "fr", label: "French" },
                { value: "de", label: "German" },
              ]}
            />

            <Group justify="right" mt="md">
              <Button onClick={handleUiPreferencesUpdate}>Save Preferences</Button>
            </Group>
          </Stack>
        </Paper>
      </Tabs.Panel>
    </Tabs>
  );
};
