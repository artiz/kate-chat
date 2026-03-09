import React from "react";
import { ActionIcon, Button, Divider, Flex, Loader, Stack, Tooltip } from "@mantine/core";
import { IconBrandGoogle, IconBrandGithub, IconBrandAzure } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { APP_API_URL } from "@/lib/config";

interface OAuthButtonsProps {
  variant?: "outline" | "filled" | "light" | "subtle";
  onLogin?: () => void;
  size?: number | string;
  condensed?: boolean;
  inline?: boolean;
}

type AuthProvider = "local" | "google" | "github" | "microsoft";

const OAuthButtons: React.FC<OAuthButtonsProps> = ({
  variant = "filled",
  onLogin,
  size = "20",
  condensed = false,
  inline = false,
}) => {
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
    <Stack gap="md" justify="center" mx={inline ? "xs" : undefined}>
      {inline ? null : <Divider label={t("auth.orContinueWith")} labelPosition="center" my="lg" />}
      <Flex gap="xs" wrap="wrap" justify={condensed ? "center" : " flex-start"} align="flex-start" direction="row">
        {oauthProviders.includes("google") &&
          (condensed ? (
            <Tooltip label={t("auth.loginWithGoogle")}>
              <ActionIcon variant={variant} color="red" radius="xl" component="a" href={`${APP_API_URL}/auth/google`}>
                <IconBrandGoogle size={size} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Button
              leftSection={<IconBrandGoogle size={size} />}
              variant={variant}
              color="red"
              onClick={() => handleLogin("google")}
              disabled={loggingIn}
            >
              Google
            </Button>
          ))}

        {oauthProviders.includes("github") &&
          (condensed ? (
            <Tooltip label={t("auth.loginWithGithub")}>
              <ActionIcon variant={variant} color="dark" radius="xl" component="a" href={`${APP_API_URL}/auth/github`}>
                <IconBrandGithub size={size} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Button
              leftSection={<IconBrandGithub size={size} />}
              variant={variant}
              color="gray"
              onClick={() => handleLogin("github")}
              disabled={loggingIn}
            >
              GitHub
            </Button>
          ))}

        {oauthProviders.includes("microsoft") &&
          (condensed ? (
            <Tooltip label={t("auth.loginWithMicrosoft")}>
              <ActionIcon
                variant={variant}
                color="blue"
                radius="xl"
                component="a"
                href={`${APP_API_URL}/auth/microsoft`}
              >
                <IconBrandAzure size={size} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Button
              leftSection={<IconBrandAzure size={size} />}
              variant={variant}
              color="blue"
              onClick={() => handleLogin("microsoft")}
              disabled={loggingIn}
            >
              Microsoft
            </Button>
          ))}
      </Flex>
      {inline ? null : <Divider labelPosition="center" my="lg" />}
    </Stack>
  );
};

export default OAuthButtons;
