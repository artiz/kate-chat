import React, { useState } from "react";
import { gql, useMutation } from "@apollo/client";
import {
  Container,
  Title,
  Paper,
  TextInput,
  PasswordInput,
  Button,
  Group,
  Stack,
  Divider,
  Switch,
  Select,
  Text,
  SegmentedControl,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAppSelector } from "../store";
import { useTheme } from "../hooks/useTheme";

// GraphQL mutations
const UPDATE_USER_MUTATION = gql`
  mutation UpdateUser($input: UpdateUserInput!) {
    updateUser(input: $input) {
      id
      email
      firstName
      lastName
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

const Settings: React.FC = () => {
  const user = useAppSelector(state => state.user.currentUser);

  // User profile form state
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [email, setEmail] = useState(user?.email || "");

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI preferences state
  const { colorScheme, setColorScheme } = useTheme();
  const [language, setLanguage] = useState("en");

  // Update user mutation
  const [updateUser, { loading: updateLoading }] = useMutation(UPDATE_USER_MUTATION, {
    onCompleted: () => {
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

  if (!user) return null;

  return (
    <Container size="md" py="xl">
      <Title order={2} mb="xl">
        Settings
      </Title>

      {/* Profile Settings */}
      <Paper withBorder p="xl" mb="xl">
        <Title order={3} mb="md">
          Profile Settings
        </Title>

        <form onSubmit={handleProfileUpdate}>
          <Stack spacing="md">
            <Group grow>
              <TextInput label="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} required />
              <TextInput label="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} required />
            </Group>

            <TextInput label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />

            <Group position="right" mt="md">
              <Button type="submit" loading={updateLoading}>
                Save Profile
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>

      {/* Password Settings */}
      <Paper withBorder p="xl" mb="xl">
        <Title order={3} mb="md">
          Change Password
        </Title>

        <form onSubmit={handlePasswordChange}>
          <Stack spacing="md">
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

            <Group position="right" mt="md">
              <Button type="submit" loading={passwordLoading}>
                Change Password
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>

      {/* UI Preferences */}
      <Paper withBorder p="xl">
        <Title order={3} mb="md">
          UI Preferences
        </Title>

        <Stack spacing="md">
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

          <Group position="right" mt="md">
            <Button onClick={handleUiPreferencesUpdate}>Save Preferences</Button>
          </Group>
        </Stack>
      </Paper>
    </Container>
  );
};

export default Settings;
