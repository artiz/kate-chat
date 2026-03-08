import React, { useMemo } from "react";
import {
  Container,
  Title,
  Text,
  Stack,
  Group,
  Button,
  Paper,
  Image,
  ActionIcon,
  Tooltip,
  SimpleGrid,
  ThemeIcon,
  Anchor,
  Divider,
} from "@mantine/core";
import {
  IconLogin,
  IconUserPlus,
  IconMessageChatbot,
  IconBrain,
  IconCode,
  IconPhoto,
  IconBooks,
  IconPlugConnected,
  IconBrandGithub,
  IconFileCv,
  IconNetwork,
  IconLink,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getClientConfig, getClientNavLinks, NavLinkIcon } from "@/global-config";
import { OAuthButtons } from "@/components/auth";
import logo from "@/assets/logo.png";

const renderNavIcon = (icon: NavLinkIcon, size = 24) => {
  switch (icon) {
    case "cv":
      return <IconFileCv size={size} />;
    case "github":
      return <IconBrandGithub size={size} />;
    case "network":
      return <IconNetwork size={size} />;
    case "link":
    default:
      return <IconLink size={size} />;
  }
};

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { appTitle } = getClientConfig();
  const navLinks = useMemo(() => getClientNavLinks(), []);

  const features = [
    { icon: IconMessageChatbot, key: "multiModel" },
    { icon: IconBrain, key: "realTime" },
    { icon: IconCode, key: "codeExecution" },
    { icon: IconPhoto, key: "imageSupport" },
    { icon: IconBooks, key: "rag" },
    { icon: IconPlugConnected, key: "mcpSupport" },
  ];

  return (
    <Container size="md" my={40}>
      <Stack gap="xl" align="center">
        {/* Hero Section */}
        <Stack align="center" gap="md">
          <Image src={logo} alt={appTitle} w={80} h={80} fit="contain" />
          <Title order={1} ta="center">
            {appTitle}
          </Title>
          <Text size="lg" c="dimmed" ta="center" maw={600}>
            {t("home.subtitle")}
          </Text>
        </Stack>

        {/* App Description */}
        <Paper withBorder shadow="sm" p="xl" radius="md" w="100%">
          <Stack gap="md">
            <Title order={3} ta="center">
              {t("home.aboutTitle", { appTitle })}
            </Title>
            <Text ta="center">{t("home.aboutText", { appTitle })}</Text>
          </Stack>
        </Paper>

        {/* Features Grid */}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg" w="100%">
          {features.map(({ icon: Icon, key }) => (
            <Paper key={key} withBorder shadow="xs" p="lg" radius="md">
              <Stack align="center" gap="sm">
                <ThemeIcon size={48} radius="md" variant="light">
                  <Icon size={28} />
                </ThemeIcon>
                <Text fw={500} ta="center">
                  {t(`home.features.${key}`)}
                </Text>
                <Text size="sm" c="dimmed" ta="center">
                  {t(`home.features.${key}Desc`)}
                </Text>
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>

        {/* Data Usage Transparency */}
        <Paper withBorder shadow="sm" p="xl" radius="md" w="100%">
          <Stack gap="md">
            <Title order={3} ta="center">
              {t("home.dataUsageTitle")}
            </Title>
            <Text ta="center">{t("home.dataUsageText", { appTitle })}</Text>
          </Stack>
        </Paper>

        {/* Auth Section */}
        <Paper withBorder shadow="md" p="xl" radius="md" w="100%">
          <Stack gap="md" align="center">
            <Title order={3}>{t("home.getStarted")}</Title>
            <Text ta="center" c="dimmed">
              {t("home.getStartedText", { appTitle })}
            </Text>

            <Group justify="center" gap="md">
              <Button size="lg" leftSection={<IconLogin size={20} />} onClick={() => navigate("/login")}>
                {t("auth.signIn")}
              </Button>
              <Button
                size="lg"
                variant="outline"
                leftSection={<IconUserPlus size={20} />}
                onClick={() => navigate("/register")}
              >
                {t("auth.register")}
              </Button>
            </Group>

            <OAuthButtons variant="outline" condensed />
          </Stack>
        </Paper>

        {/* Nav Links */}
        {navLinks.length > 0 && (
          <Group justify="center" gap="lg">
            {navLinks.map(link => (
              <Tooltip key={link.url} label={link.tooltip}>
                <ActionIcon
                  component="a"
                  variant="subtle"
                  size="xl"
                  href={link.url}
                  target="_blank"
                  color={link.color || "dark"}
                >
                  {renderNavIcon(link.icon)}
                </ActionIcon>
              </Tooltip>
            ))}
          </Group>
        )}

        {/* Footer Links */}
        <Divider w="100%" />
        <Group justify="center" gap="xl" pb="xl">
          <Anchor component="button" size="sm" onClick={() => navigate("/privacy")}>
            {t("legal.privacyPolicy")}
          </Anchor>
          <Anchor component="button" size="sm" onClick={() => navigate("/terms")}>
            {t("legal.termsOfService")}
          </Anchor>
        </Group>
      </Stack>
    </Container>
  );
};

export default Home;
