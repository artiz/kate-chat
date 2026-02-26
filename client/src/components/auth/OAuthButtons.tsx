import React from "react";
import { Button, Divider, Flex, Loader, Stack } from "@mantine/core";
import { IconBrandGoogle, IconBrandGithub, IconBrandAzure } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { APP_API_URL } from "@/lib/config";

interface OAuthButtonsProps {
  variant?: "outline" | "filled" | "light";
  onLogin?: () => void;
}

type AuthProvider = "local" | "google" | "github" | "microsoft";

const OAuthButtons: React.FC<OAuthButtonsProps> = ({ variant = "filled", onLogin }) => {
  const { t } = useTranslation();
  const [loggingIn, setLoggingIn] = React.useState(false);
  const [providers, setProviders] = React.useState<AuthProvider[] | null>(null);

  React.useEffect(() => {
    fetch(`${APP_API_URL}/auth/providers`)
      .then(res => res.json())
      .then(data => setProviders(data))
      .catch(() => setProviders(["local"]));
  }, []);

  const handleLogin = (provider: string) => {
    setLoggingIn(true);
    onLogin?.();
    window.location.href = `${APP_API_URL}/auth/${provider}`;
  };

  if (providers === null) {
    return (
      <Stack gap="md" align="center">
        <Loader size="sm" />
      </Stack>
    );
  }

  const oauthProviders = providers.filter(p => p !== "local");
  if (oauthProviders.length === 0) return null;

  return (
    <Stack gap="md">
      <Divider label={t("auth.orContinueWith")} labelPosition="center" my="lg" />
      <Flex gap="md" wrap="wrap" justify="flex-start" align="flex-start" direction="row">
        {oauthProviders.includes("google") && (
          <Button
            leftSection={<IconBrandGoogle size={16} />}
            variant={variant}
            color="red"
            onClick={() => handleLogin("google")}
            disabled={loggingIn}
          >
            Google
          </Button>
        )}

        {oauthProviders.includes("github") && (
          <Button
            leftSection={<IconBrandGithub size={16} />}
            variant={variant}
            color="gray"
            onClick={() => handleLogin("github")}
            disabled={loggingIn}
          >
            GitHub
          </Button>
        )}

        {oauthProviders.includes("microsoft") && (
          <Button
            leftSection={<IconBrandAzure size={16} />}
            variant={variant}
            color="blue"
            onClick={() => handleLogin("microsoft")}
            disabled={loggingIn}
          >
            Microsoft
          </Button>
        )}
      </Flex>
      <Divider labelPosition="center" my="lg" />
    </Stack>
  );
};

export default OAuthButtons;
