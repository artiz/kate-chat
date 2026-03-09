import React from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconSun, IconMoon } from "@tabler/icons-react";
import { useTheme } from "@katechat/ui";
import { useTranslation } from "react-i18next";

export const ThemeSelector: React.FC<{ size?: string | number }> = ({ size = 20 }) => {
  const { colorScheme, toggleColorScheme } = useTheme();
  const { t } = useTranslation();

  return (
    <Tooltip label={colorScheme === "dark" ? t("nav.switchToLight") : t("nav.switchToDark")}>
      <ActionIcon
        variant="subtle"
        radius="xl"
        onClick={() => {
          toggleColorScheme();
          // Force UI update
          setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
        }}
        aria-label="Toggle theme"
      >
        {colorScheme === "dark" ? <IconSun size={size} /> : <IconMoon size={size} />}
      </ActionIcon>
    </Tooltip>
  );
};
