import React, { useState, useEffect, use, useMemo } from "react";
import { Paper, TextInput, Button, Group, Stack, Text, SegmentedControl } from "@mantine/core";
import { useTheme } from "@katechat/ui";
import { useTranslation } from "react-i18next";
import { UpdateUserInput, User } from "@/store/slices/userSlice";

type ColorScheme = "light" | "dark" | "auto";

interface ProfileSettingsProps {
  user: User;
  updateLoading?: boolean;
  updateUser: (input: UpdateUserInput) => Promise<void>;
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({ user, updateUser, updateLoading }) => {
  // User profile form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const { t } = useTranslation();

  // UI preferences state
  const { colorScheme, setColorScheme } = useTheme();

  const isLocalUser = React.useMemo(() => {
    return !user?.authProvider || user?.authProvider === "local";
  }, [user]);

  // Update when user changes
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setEmail(user.email || "");
    }
  }, [user]);

  const provider = useMemo(() => {
    if (!user) return "Unknown";

    return user.authProvider || "Local";
  }, [user]);

  // Handle profile update
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    await updateUser({
      firstName,
      lastName,
      email,
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

  if (!user) return null;

  return (
    <Paper withBorder p="xl">
      <form name="profile-settings" onSubmit={handleProfileUpdate}>
        <Stack gap="md" mb="lg">
          <Text mb="xs">{t("profile.theme")}</Text>
          <SegmentedControl
            value={colorScheme}
            onChange={handleThemeUpdate}
            data={[
              { label: t("profile.themeLight"), value: "light" },
              { label: t("profile.themeDark"), value: "dark" },
              { label: t("profile.themeAuto"), value: "auto" },
            ]}
            fullWidth
          />
        </Stack>

        <Stack gap="md">
          <Group grow>
            <TextInput
              label={t("auth.firstName")}
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              required
            />
            <TextInput
              label={t("auth.lastName")}
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              required
            />
          </Group>

          <TextInput
            label={t("auth.email")}
            disabled={!isLocalUser}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required={isLocalUser ? true : undefined}
            description={t("profile.provider", { provider })}
          />

          <Group justify="right" mt="md">
            <Button type="submit" loading={updateLoading}>
              {t("profile.saveProfile")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
};
