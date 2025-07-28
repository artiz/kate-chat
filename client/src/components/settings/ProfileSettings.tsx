import React, { useState, useEffect, use } from "react";
import { Paper, TextInput, Button, Group, Stack, Text, SegmentedControl } from "@mantine/core";
import { useTheme } from "@/hooks/useTheme";
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

  // UI preferences state
  const { colorScheme, setColorScheme } = useTheme();

  const isLocalUser = React.useMemo(() => {
    return !user?.googleId && !user?.githubId;
  }, [user]);

  // Update when user changes
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setEmail(user.email || "");
    }
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
            required={isLocalUser ? true : undefined}
          />

          <Group justify="right" mt="md">
            <Button type="submit" loading={updateLoading}>
              Save Profile
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
};
