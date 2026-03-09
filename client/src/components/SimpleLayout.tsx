import React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AppShell, Group, Text, ActionIcon, Tooltip, Anchor } from "@mantine/core";
import { IconSun, IconMoon } from "@tabler/icons-react";
import { LanguageSelector, useTheme } from "@katechat/ui";
import { useTranslation } from "react-i18next";
import { getClientConfig } from "@/global-config";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { OAuthButtons } from "./auth";
import { useAppSelector } from "@/store";
import { ThemeSelector } from "./common/ThemeSelector";

export const SimpleLayout: React.FC = () => {
  const navigate = useNavigate();
  const { appTitle } = getClientConfig();
  const { isAuthenticated } = useAppSelector(state => state.auth);

  return (
    <AppShell header={{ height: 60 }} padding="0" withBorder>
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Anchor onClick={() => navigate("/")} underline="never" c="inherit">
              <Text size="lg" fw={700}>
                {appTitle}
              </Text>
            </Anchor>
          </Group>
          <Group gap="0">
            {!isAuthenticated && <OAuthButtons variant="subtle" condensed inline />}
            <ThemeSelector />
            <LanguageSelector languages={SUPPORTED_LANGUAGES} />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
};
