import React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AppShell, Group, Text, ActionIcon, Tooltip, Anchor } from "@mantine/core";
import { IconSun, IconMoon } from "@tabler/icons-react";
import { LanguageSelector, useTheme } from "@katechat/ui";
import { useTranslation } from "react-i18next";
import { getClientConfig } from "@/global-config";
import { SUPPORTED_LANGUAGES } from "@/i18n";

export const SimpleLayout: React.FC = () => {
  const navigate = useNavigate();
  const { colorScheme, toggleColorScheme } = useTheme();
  const { t } = useTranslation();
  const { appTitle } = getClientConfig();

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
          <Group>
            <Tooltip label={colorScheme === "dark" ? t("nav.switchToLight") : t("nav.switchToDark")}>
              <ActionIcon
                variant="subtle"
                onClick={() => {
                  toggleColorScheme();
                  // Force UI update
                  setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
                }}
                aria-label="Toggle theme"
              >
                {colorScheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>
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
