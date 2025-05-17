"use client";

import { useState } from "react";
import { gql, useQuery, useMutation } from "@apollo/client";
import {
  Container,
  Title,
  Text,
  Paper,
  Stack,
  Group,
  Button,
  TextInput,
  Divider,
  PasswordInput,
  LoadingOverlay,
  Alert,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconInfoCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

// Get current user query
const GET_CURRENT_USER = gql`
  query GetCurrentUser {
    currentUser {
      id
      email
      firstName
      lastName
    }
  }
`;

// Update user mutation
const UPDATE_USER = gql`
  mutation UpdateUser($input: UpdateUserInput!) {
    updateUser(input: $input) {
      id
      email
      firstName
      lastName
    }
  }
`;

// Change password mutation
const CHANGE_PASSWORD = gql`
  mutation ChangePassword($input: ChangePasswordInput!) {
    changePassword(input: $input)
  }
`;

export default function SettingsPage() {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Get current user
  const { data, loading, error, refetch } = useQuery(GET_CURRENT_USER, {
    fetchPolicy: "network-only",
  });

  // Initialize form with user data
  const profileForm = useForm({
    initialValues: {
      firstName: "",
      lastName: "",
      email: "",
    },
    validate: {
      firstName: value => (!value ? "First name is required" : null),
      lastName: value => (!value ? "Last name is required" : null),
      email: value => (/^\S+@\S+$/.test(value) ? null : "Invalid email"),
    },
  });

  // Password form
  const passwordForm = useForm({
    initialValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    validate: {
      currentPassword: value => (!value ? "Current password is required" : null),
      newPassword: value => (value.length < 6 ? "Password must be at least 6 characters" : null),
      confirmPassword: (value, values) => (value !== values.newPassword ? "Passwords do not match" : null),
    },
  });

  // Update user profile mutation
  const [updateUser, { loading: updating }] = useMutation(UPDATE_USER, {
    onCompleted: () => {
      notifications.show({
        title: "Profile updated",
        message: "Your profile has been updated successfully",
        color: "green",
      });
      setIsEditingProfile(false);
      refetch();
    },
    onError: error => {
      notifications.show({
        title: "Error updating profile",
        message: error.message,
        color: "red",
      });
    },
  });

  // Change password mutation
  const [changePassword, { loading: changingPassword }] = useMutation(CHANGE_PASSWORD, {
    onCompleted: () => {
      notifications.show({
        title: "Password changed",
        message: "Your password has been changed successfully",
        color: "green",
      });
      setIsChangingPassword(false);
      passwordForm.reset();
    },
    onError: error => {
      notifications.show({
        title: "Error changing password",
        message: error.message,
        color: "red",
      });
    },
  });

  // Update form values when user data is loaded
  if (data?.currentUser && !isEditingProfile) {
    profileForm.setValues({
      firstName: data.currentUser.firstName || "",
      lastName: data.currentUser.lastName || "",
      email: data.currentUser.email || "",
    });
  }

  // Handle edit profile
  const handleEditProfile = () => {
    setIsEditingProfile(true);
  };

  // Handle save profile
  const handleSaveProfile = (values: typeof profileForm.values) => {
    updateUser({
      variables: {
        input: {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
        },
      },
    });
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setIsEditingProfile(false);

    // Reset form to original values
    if (data?.currentUser) {
      profileForm.setValues({
        firstName: data.currentUser.firstName || "",
        lastName: data.currentUser.lastName || "",
        email: data.currentUser.email || "",
      });
    }
  };

  // Handle change password
  const handleChangePassword = (values: typeof passwordForm.values) => {
    changePassword({
      variables: {
        input: {
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        },
      },
    });
  };

  return (
    <Container size="md" py="xl">
      <Title mb="xl">Settings</Title>

      {error && (
        <Alert icon={<IconInfoCircle size={16} />} title="Error" color="red" mb="xl">
          {error.message || "An error occurred. Please try again later."}
        </Alert>
      )}

      {/* Profile Section */}
      <Paper withBorder p="md" radius="md" mb="xl" pos="relative">
        <LoadingOverlay visible={loading || updating} />

        <Title order={3} mb="md">
          Profile Information
        </Title>
        <Text c="dimmed" mb="lg" size="sm">
          Update your personal information
        </Text>

        <form onSubmit={profileForm.onSubmit(handleSaveProfile)}>
          <Stack>
            <Group grow>
              <TextInput
                label="First Name"
                placeholder="Your first name"
                {...profileForm.getInputProps("firstName")}
                disabled={!isEditingProfile}
              />
              <TextInput
                label="Last Name"
                placeholder="Your last name"
                {...profileForm.getInputProps("lastName")}
                disabled={!isEditingProfile}
              />
            </Group>

            <TextInput
              label="Email"
              placeholder="Your email"
              {...profileForm.getInputProps("email")}
              disabled={!isEditingProfile}
            />

            <Group justify="flex-end">
              {!isEditingProfile ? (
                <Button onClick={handleEditProfile}>Edit Profile</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={updating}>
                    Save Changes
                  </Button>
                </>
              )}
            </Group>
          </Stack>
        </form>
      </Paper>

      {/* Password Section */}
      <Paper withBorder p="md" radius="md" pos="relative">
        <LoadingOverlay visible={changingPassword} />

        <Title order={3} mb="md">
          Change Password
        </Title>
        <Text c="dimmed" mb="lg" size="sm">
          Update your account password
        </Text>

        {!isChangingPassword ? (
          <Button onClick={() => setIsChangingPassword(true)}>Change Password</Button>
        ) : (
          <form onSubmit={passwordForm.onSubmit(handleChangePassword)}>
            <Stack>
              <PasswordInput
                label="Current Password"
                placeholder="Enter your current password"
                {...passwordForm.getInputProps("currentPassword")}
              />

              <PasswordInput
                label="New Password"
                placeholder="Enter your new password"
                {...passwordForm.getInputProps("newPassword")}
              />

              <PasswordInput
                label="Confirm New Password"
                placeholder="Confirm your new password"
                {...passwordForm.getInputProps("confirmPassword")}
              />

              <Group justify="flex-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsChangingPassword(false);
                    passwordForm.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={changingPassword}>
                  Update Password
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Paper>
    </Container>
  );
}
