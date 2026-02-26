import React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import {
  AppShell,
  Burger,
  Group,
  Avatar,
  Text,
  UnstyledButton,
  Menu,
  Divider,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { useDisclosure, useMediaQuery, useLocalStorage } from "@mantine/hooks";
import { IconLogout, IconChevronRight, IconSun, IconMoon, IconUser, IconWifi, IconRobot } from "@tabler/icons-react";
import { useDispatch } from "react-redux";
import { LanguageSelector, useTheme } from "@katechat/ui";
import { useTranslation } from "react-i18next";
import { useAppSelector } from "../store";
import { logout } from "../store";
import NavbarContent from "./nav/NavbarContent";
import { MOBILE_BREAKPOINT } from "@/lib/config";
import { getClientConfig } from "@/global-config";
import { SUPPORTED_LANGUAGES } from "@/i18n";

export const SimpleLayout: React.FC = () => {
  const dispatch = useDispatch();
  const { colorScheme, toggleColorScheme } = useTheme();
  const { t } = useTranslation();
  const { appTitle } = getClientConfig();

  return (
    <AppShell header={{ height: 60 }} padding="0" withBorder>
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Text size="lg" fw={700}>
              {appTitle}
            </Text>
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
