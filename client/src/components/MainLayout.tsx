import React from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
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
  Indicator,
} from "@mantine/core";
import { useDisclosure, useMediaQuery, useLocalStorage } from "@mantine/hooks";
import { SearchDrawer } from "./search/SearchDrawer";
import { IconLogout, IconChevronRight, IconUser, IconWifi, IconRobot, IconSearch } from "@tabler/icons-react";
import { useDispatch } from "react-redux";
import { LanguageSelector, useTheme } from "@katechat/ui";
import { useTranslation } from "react-i18next";
import { removeStorageValue, STORAGE_RETURN_URL_KEY, useAppSelector } from "../store";
import { logout } from "../store/";
import NavbarContent from "./nav/NavbarContent";
import { MOBILE_BREAKPOINT } from "@/lib/config";
import { getClientConfig } from "@/global-config";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { UserRole } from "@/store/slices/userSlice";
import { ThemeSelector } from "./common/ThemeSelector";

export const MainLayout: React.FC = () => {
  const [opened, { toggle, close: closeNavbar }] = useDisclosure();
  const [searchOpened, { open: openSearch, close: closeSearch }] = useDisclosure(false);
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  // Get user data from Redux store
  const { currentUser, appConfig } = useAppSelector(state => state.user);
  const [navbarExpanded, setNavbarExpanded] = useLocalStorage({
    key: "navbar-expanded",
    defaultValue: true,
  });
  const { appTitle } = getClientConfig();

  // Handle logout
  const handleLogout = () => {
    removeStorageValue(STORAGE_RETURN_URL_KEY, currentUser?.id, false);
    dispatch(logout());
    navigate("/");
  };

  if (!currentUser) {
    return null;
  }

  // User data for display
  const userInitials = `${currentUser?.firstName?.[0]}${currentUser?.lastName?.[0]}`.toUpperCase();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: navbarExpanded ? 300 : 44,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="0"
      withBorder
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Tooltip
              label={
                appConfig?.demoMode
                  ? t("nav.demoModeTooltip", {
                      maxChats: appConfig?.maxChats,
                      maxChatMessages: appConfig?.maxChatMessages,
                      maxImages: appConfig?.maxImages,
                    })
                  : undefined
              }
              disabled={!appConfig?.demoMode}
              color={appConfig?.demoMode ? "red" : undefined}
            >
              <Indicator color="red" size="md" label={t("nav.demoMode")} disabled={!appConfig?.demoMode}>
                <Text size="lg" fw={700}>
                  {appTitle}
                </Text>
              </Indicator>
            </Tooltip>
          </Group>
          <Group>
            {isMobile && (
              <Tooltip label={t("search.title")}>
                <ActionIcon variant="subtle" onClick={openSearch} size="lg" color="gray">
                  <IconSearch size={20} />
                </ActionIcon>
              </Tooltip>
            )}
            <ThemeSelector />
            <LanguageSelector languages={SUPPORTED_LANGUAGES} />

            <Menu shadow="md" width={200} position="bottom-end">
              <Menu.Target>
                <UnstyledButton>
                  <Group gap={8}>
                    <Indicator
                      color="indigo"
                      size="md"
                      label={t("profile.admin")}
                      disabled={currentUser.role !== UserRole.ADMIN}
                    >
                      <Avatar color="blue" radius="xl" src={currentUser?.avatarUrl}>
                        {userInitials}
                      </Avatar>
                    </Indicator>
                    <div>
                      <Text visibleFrom="sm" size="sm" fw={500}>
                        {currentUser?.firstName} {currentUser?.lastName}
                      </Text>
                      <Text visibleFrom="sm" size="xs" c="dimmed">
                        {currentUser?.email}
                      </Text>
                    </div>
                    <IconChevronRight size={18} stroke={1.5} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Item leftSection={<IconUser size={14} />} onClick={() => navigate("/profile")}>
                  {t("nav.profile")}
                </Menu.Item>

                <Menu.Item leftSection={<IconWifi size={14} />} onClick={() => navigate("/connectivity")}>
                  {t("nav.connectivitySettings")}
                </Menu.Item>

                <Menu.Item leftSection={<IconRobot size={14} />} onClick={() => navigate("/models")}>
                  {t("nav.models")}
                </Menu.Item>

                <Divider />
                <Menu.Item leftSection={<IconLogout size={14} />} onClick={handleLogout} color="red">
                  {t("nav.logout")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="0">
        <NavbarContent
          navbarToggle={isMobile ? toggle : undefined}
          expanded={isMobile ? true : navbarExpanded}
          onToggleExpand={isMobile ? undefined : () => setNavbarExpanded(v => !v)}
          onOpenSearch={openSearch}
        />
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>

      <SearchDrawer opened={searchOpened} onClose={closeSearch} navbarToggle={isMobile ? closeNavbar : undefined} />
    </AppShell>
  );
};
