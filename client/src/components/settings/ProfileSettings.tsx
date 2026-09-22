import React, { useState, useEffect, use, useMemo } from "react";
import { Paper, TextInput, Button, Group, Stack, Text, SegmentedControl, Select } from "@mantine/core";
import { setAppTimeZone, useTheme } from "@katechat/ui";
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
  const [timezone, setTimezone] = useState("");
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
      setTimezone(user.settings?.timezone || "");
    }
  }, [user]);

  const browserTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  const timezoneOptions = useMemo(() => {
    // supportedValuesOf is missing on older engines; the saved zone still works there
    const supported =
      (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") || [];
    const zones = supported.length ? supported : [browserTimezone];
    return [{ value: "", label: t("profile.timezoneAuto", { timezone: browserTimezone }) }].concat(
      zones.map(zone => ({ value: zone, label: zone }))
    );
  }, [browserTimezone, t]);

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
      settings: { timezone },
    });

    // the dates on screen follow the new zone without a reload
    setAppTimeZone(timezone);
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

          <Select
            label={t("profile.timezone")}
            description={t("profile.timezoneDescription")}
            data={timezoneOptions}
            value={timezone}
            onChange={value => setTimezone(value || "")}
            searchable
            allowDeselect={false}
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
