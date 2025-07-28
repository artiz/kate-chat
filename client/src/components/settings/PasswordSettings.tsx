import React, { useState } from "react";
import { gql, useMutation } from "@apollo/client";
import { Paper, PasswordInput, Button, Group, Stack, Divider } from "@mantine/core";
import { notifications } from "@mantine/notifications";

// GraphQL mutations
const CHANGE_PASSWORD_MUTATION = gql`
  mutation ChangePassword($input: ChangePasswordInput!) {
    changePassword(input: $input) {
      success
    }
  }
`;

interface PasswordSettingsProps {}

export const PasswordSettings: React.FC<PasswordSettingsProps> = () => {
  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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

  return (
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
  );
};
