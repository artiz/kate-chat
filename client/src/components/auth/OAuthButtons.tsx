import React from "react";
import { Button, Group, Divider, Text, Stack, Flex, Loader } from "@mantine/core";
import { IconBrandGoogle, IconBrandGithub, IconBrandOffice, IconBrandAzure } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { APP_API_URL } from "@/lib/config";

interface OAuthButtonsProps {
  variant?: "outline" | "filled" | "light";
  onLogin?: () => void;
}

const OAuthButtons: React.FC<OAuthButtonsProps> = ({ variant = "outline", onLogin }) => {
  const { t } = useTranslation();
  const [loggingIn, setLoggingIn] = React.useState(false);

  const handleGoogleLogin = () => {
    setLoggingIn(true);
    onLogin?.();
    window.location.href = `${APP_API_URL}/auth/google`;
  };

  const handleGithubLogin = () => {
    setLoggingIn(true);
    onLogin?.();
    window.location.href = `${APP_API_URL}/auth/github`;
  };

  const handleMicrosoftLogin = () => {
    setLoggingIn(true);
    onLogin?.();
    window.location.href = `${APP_API_URL}/auth/microsoft`;
  };

  return (
    <Stack gap="md">
      <Divider label={t("auth.orContinueWith")} labelPosition="center" my="lg" />
      <Flex gap="md" wrap="wrap" justify="flex-start" align="flex-start" direction="row">
        <Button
          leftSection={<IconBrandGoogle size={16} />}
          variant={variant}
          color="red.9"
          onClick={handleGoogleLogin}
          disabled={loggingIn}
        >
          Google
        </Button>

        <Button
          leftSection={<IconBrandGithub size={16} />}
          variant={variant}
          color="black.8"
          onClick={handleGithubLogin}
          disabled={loggingIn}
        >
          GitHub
        </Button>

        <Button
          leftSection={<IconBrandAzure size={16} />}
          variant={variant}
          color="blue.9"
          onClick={handleMicrosoftLogin}
          disabled={loggingIn}
        >
          Microsoft
        </Button>
      </Flex>
      <Divider labelPosition="center" my="lg" />
    </Stack>
  );
};

export default OAuthButtons;
