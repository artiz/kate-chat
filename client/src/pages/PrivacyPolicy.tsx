import React from "react";
import { Container, Title, Text, Stack, Paper, Anchor, Group, Divider } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getClientConfig } from "@/global-config";
import { OAuthButtons } from "@/components/auth";
import { useAppSelector } from "@/store";

const PrivacyPolicy: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { appTitle } = getClientConfig();
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated);

  return (
    <Container size="md" my={40}>
      <Anchor component="button" size="sm" mb="md" onClick={() => navigate("/")}>
        <Group gap={4}>
          <IconArrowLeft size={16} />
          {appTitle}
        </Group>
      </Anchor>
      <Paper withBorder shadow="sm" p="xl" radius="md">
        <Stack gap="lg">
          <Title order={1}>{t("legal.privacyPolicy")}</Title>
          <Text c="dimmed" size="sm">
            {t("legal.lastUpdated", { date: "2025-01-01" })}
          </Text>

          <Title order={3}>{t("legal.privacy.introTitle")}</Title>
          <Text>{t("legal.privacy.introText", { appTitle })}</Text>

          <Title order={3}>{t("legal.privacy.dataCollectionTitle")}</Title>
          <Text>{t("legal.privacy.dataCollectionText", { appTitle })}</Text>
          <Text component="ul">
            <li>{t("legal.privacy.dataItem1")}</li>
            <li>{t("legal.privacy.dataItem2")}</li>
            <li>{t("legal.privacy.dataItem3")}</li>
            <li>{t("legal.privacy.dataItem4")}</li>
          </Text>

          <Title order={3}>{t("legal.privacy.dataUseTitle")}</Title>
          <Text>{t("legal.privacy.dataUseText")}</Text>
          <Text component="ul">
            <li>{t("legal.privacy.useItem1")}</li>
            <li>{t("legal.privacy.useItem2")}</li>
            <li>{t("legal.privacy.useItem3")}</li>
            <li>{t("legal.privacy.useItem4")}</li>
          </Text>

          <Title order={3}>{t("legal.privacy.dataSharingTitle")}</Title>
          <Text>{t("legal.privacy.dataSharingText")}</Text>

          <Title order={3}>{t("legal.privacy.thirdPartyTitle")}</Title>
          <Text>{t("legal.privacy.thirdPartyText", { appTitle })}</Text>

          <Title order={3}>{t("legal.privacy.dataSecurityTitle")}</Title>
          <Text>{t("legal.privacy.dataSecurityText")}</Text>

          <Title order={3}>{t("legal.privacy.userRightsTitle")}</Title>
          <Text>{t("legal.privacy.userRightsText")}</Text>
          <Text component="ul">
            <li>{t("legal.privacy.rightItem1")}</li>
            <li>{t("legal.privacy.rightItem2")}</li>
            <li>{t("legal.privacy.rightItem3")}</li>
            <li>{t("legal.privacy.rightItem4")}</li>
          </Text>

          <Title order={3}>{t("legal.privacy.cookiesTitle")}</Title>
          <Text>{t("legal.privacy.cookiesText")}</Text>

          <Title order={3}>{t("legal.privacy.changesTitle")}</Title>
          <Text>{t("legal.privacy.changesText")}</Text>

          <Title order={3}>{t("legal.privacy.contactTitle")}</Title>
          <Text>{t("legal.privacy.contactText", { appTitle })}</Text>
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

export default PrivacyPolicy;
