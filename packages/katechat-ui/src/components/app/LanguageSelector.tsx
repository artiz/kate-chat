import React from "react";
import { Menu, ActionIcon, Tooltip } from "@mantine/core";
import { IconLanguage } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { LANGUAGE_STORAGE_KEY, BASE_SUPPORTED_LANGUAGES } from "@/i18n";

export const LanguageSelector = ({ languages = BASE_SUPPORTED_LANGUAGES }: { languages?: string[] }) => {
  const { t, i18n } = useTranslation();

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  };

  return (
    <Menu shadow="md" width={150} position="bottom-end">
      <Menu.Target>
        <Tooltip label={t("language.label")}>
          <ActionIcon variant="subtle" aria-label={t("language.label")}>
            <IconLanguage size={18} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {languages.map(lang => (
          <Menu.Item key={lang} onClick={() => handleLanguageChange(lang)} fw={i18n.language === lang ? 700 : 400}>
            {t(`language.${lang}`)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
