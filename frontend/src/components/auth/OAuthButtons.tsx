import React from "react";
import { Button, Group, Divider, Text, Stack } from "@mantine/core";
import { IconBrandGoogle, IconBrandGithub } from "@tabler/icons-react";
import { APP_API_URL } from "@/utils/config";

interface OAuthButtonsProps {
  variant?: "outline" | "filled" | "light";
}

const OAuthButtons: React.FC<OAuthButtonsProps> = ({ variant = "outline" }) => {
  // Backend API URL
  const apiUrl = APP_API_URL;

  const handleGoogleLogin = () => {
    window.location.href = `${apiUrl}/api/auth/google`;
  };

  const handleGithubLogin = () => {
    window.location.href = `${apiUrl}/api/auth/github`;
  };

  return (
    <Stack gap="md">
      <Divider label="Or continue with" labelPosition="center" my="lg" />

      <Group grow>
        <Button leftSection={<IconBrandGoogle size={16} />} variant={variant} color="red.9" onClick={handleGoogleLogin}>
          Google
        </Button>

        <Button
          leftSection={<IconBrandGithub size={16} />}
          variant={variant}
          color="blue.9"
          onClick={handleGithubLogin}
        >
          GitHub
        </Button>
      </Group>
    </Stack>
  );
};

export default OAuthButtons;
