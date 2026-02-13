import React, { useState } from "react";
import { gql, useMutation } from "@apollo/client";
import { Paper, PasswordInput, Button, Group, Stack, Divider } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  // Change password mutation
  const [changePassword, { loading: passwordLoading }] = useMutation(CHANGE_PASSWORD_MUTATION, {
    onCompleted: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      notifications.show({
        title: t("password.changed"),
        message: t("password.changedMessage"),
        color: "green",
      });
    },
    onError: error => {
      notifications.show({
        title: t("password.changeFailed"),
        message: error.message || t("password.changeFailedMessage"),
        color: "red",
      });
    },
  });

  // Handle password change
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      notifications.show({
        title: t("password.mismatch"),
        message: t("password.mismatchMessage"),
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
            label={t("password.currentPassword")}
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            required
          />

          <Divider my="sm" />

          <PasswordInput
            label={t("password.newPassword")}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
          />

          <PasswordInput
            label={t("password.confirmNewPassword")}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
          />

          <Group justify="right" mt="md">
            <Button type="submit" loading={passwordLoading}>
              {t("password.changePassword")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
};
