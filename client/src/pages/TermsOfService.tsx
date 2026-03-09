import React from "react";
import { Container, Title, Text, Stack, Paper, Anchor, Group, Divider } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getClientConfig } from "@/global-config";
import { OAuthButtons } from "@/components/auth";
import { useAppSelector } from "@/store";

const TermsOfService: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { appTitle } = getClientConfig();
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated);

  return (
    <Container size="md" pb="xl" my={40}>
      <Anchor component="button" size="sm" mb="md" onClick={() => navigate("/")}>
        <IconArrowLeft size={24} />
      </Anchor>
      <Paper withBorder shadow="sm" p="xl" radius="md">
        <Stack gap="lg">
          <Title order={1}>{t("legal.termsOfService")}</Title>
          <Text c="dimmed" size="sm">
            {t("legal.lastUpdated", { date: "2025-01-01" })}
          </Text>

          <Title order={3}>{t("legal.terms.introTitle")}</Title>
          <Text>{t("legal.terms.introText", { appTitle })}</Text>

          <Title order={3}>{t("legal.terms.licenseTitle")}</Title>
          <Text>{t("legal.terms.licenseText", { appTitle })}</Text>
          <Text>{t("legal.terms.licenseDetail")}</Text>

          <Title order={3}>{t("legal.terms.useTitle")}</Title>
          <Text>{t("legal.terms.useText", { appTitle })}</Text>
          <Text component="ul">
            <li>{t("legal.terms.useItem1")}</li>
            <li>{t("legal.terms.useItem2")}</li>
            <li>{t("legal.terms.useItem3")}</li>
            <li>{t("legal.terms.useItem4")}</li>
          </Text>

          <Title order={3}>{t("legal.terms.accountsTitle")}</Title>
          <Text>{t("legal.terms.accountsText")}</Text>

          <Title order={3}>{t("legal.terms.aiContentTitle")}</Title>
          <Text>{t("legal.terms.aiContentText")}</Text>

          <Title order={3}>{t("legal.terms.apiKeysTitle")}</Title>
          <Text>{t("legal.terms.apiKeysText", { appTitle })}</Text>

          <Title order={3}>{t("legal.terms.disclaimerTitle")}</Title>
          <Text>{t("legal.terms.disclaimerText", { appTitle })}</Text>

          <Title order={3}>{t("legal.terms.limitationTitle")}</Title>
          <Text>{t("legal.terms.limitationText", { appTitle })}</Text>

          <Title order={3}>{t("legal.terms.changesTitle")}</Title>
          <Text>{t("legal.terms.changesText")}</Text>

          <Title order={3}>{t("legal.terms.contactTitle")}</Title>
          <Text>{t("legal.terms.contactText", { appTitle })}</Text>
        </Stack>
      </Paper>

      {isAuthenticated ? null : (
        <Paper withBorder shadow="sm" p="xl" radius="md" mt="xl">
          <Stack gap="md" align="center">
            <Title order={4}>{t("home.getStarted")}</Title>
            <Group justify="center" gap="md">
              <Anchor component="button" size="sm" onClick={() => navigate("/login")}>
                {t("auth.signIn")}
              </Anchor>
              <Anchor component="button" size="sm" onClick={() => navigate("/register")}>
                {t("auth.register")}
              </Anchor>
            </Group>
            <OAuthButtons variant="outline" />
          </Stack>
        </Paper>
      )}
    </Container>
  );
};

export default TermsOfService;
