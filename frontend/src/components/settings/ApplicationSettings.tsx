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
import { Model } from "@/store/slices/modelSlice";
import { setUser } from "@/store/slices/userSlice";

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

export const ApplicationSettings: React.FC = () => {
  const user = useAppSelector(state => state.user.currentUser);
  const models = useAppSelector(state => state.models.models);
  const dispatch = useAppDispatch();

  // User profile form state
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [defaultModelId, setDefaultModelId] = useState(user?.defaultModelId || "");
  const [defaultSystemPrompt, setDefaultSystemPrompt] = useState(user?.defaultSystemPrompt || "");

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
  const handleDefaultsUpdate = async (e: React.FormEvent) => {
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

      <Tabs.Panel value="profile">
        {/* Profile Settings */}
        <Paper withBorder p="xl">
          <form onSubmit={handleProfileUpdate}>
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
          <form onSubmit={handlePasswordChange}>
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

      <Tabs.Panel value="ai">
        {/* Default Settings */}
        <Paper withBorder p="xl">
          <form onSubmit={handleDefaultsUpdate}>
            <Stack spacing="md">
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
