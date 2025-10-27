import React from "react";
import { Button, Group, Divider, Text, Stack, Flex } from "@mantine/core";
import { IconBrandGoogle, IconBrandGithub, IconBrandOffice, IconBrandAzure } from "@tabler/icons-react";
import { APP_API_URL } from "@/lib/config";

interface OAuthButtonsProps {
  variant?: "outline" | "filled" | "light";
}

const OAuthButtons: React.FC<OAuthButtonsProps> = ({ variant = "outline" }) => {
  // Backend API URL
  const apiUrl = APP_API_URL;

  const handleGoogleLogin = () => {
    window.location.href = `${apiUrl}/auth/google`;
  };

  const handleGithubLogin = () => {
    window.location.href = `${apiUrl}/auth/github`;
  };

  const handleMicrosoftLogin = () => {
    window.location.href = `${apiUrl}/auth/microsoft`;
  };

  return (
    <Stack gap="md">
      <Divider label="Or continue with" labelPosition="center" my="lg" />

      <Flex gap="md" wrap="wrap" justify="flex-start" align="flex-start" direction="row">
        <Button leftSection={<IconBrandGoogle size={16} />} variant={variant} color="red.9" onClick={handleGoogleLogin}>
          Google
        </Button>

        <Button
          leftSection={<IconBrandGithub size={16} />}
          variant={variant}
          color="black.8"
          onClick={handleGithubLogin}
        >
          GitHub
        </Button>

        <Button
          leftSection={<IconBrandAzure size={16} />}
          variant={variant}
          color="blue.9"
          onClick={handleMicrosoftLogin}
        >
          Microsoft
        </Button>
      </Flex>
    </Stack>
  );
};

export default OAuthButtons;
