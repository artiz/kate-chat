import React from "react";
import { Menu, ActionIcon, Tooltip } from "@mantine/core";
import { IconLanguage } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, SupportedLanguage, LANGUAGE_STORAGE_KEY } from "@/i18n";

export const LanguageSelector: React.FC = () => {
  const { t, i18n } = useTranslation();

  const handleLanguageChange = (lang: SupportedLanguage) => {
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
        {SUPPORTED_LANGUAGES.map(lang => (
          <Menu.Item
            key={lang}
            onClick={() => handleLanguageChange(lang)}
            fw={i18n.language === lang ? 700 : 400}
          >
            {t(`language.${lang}`)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
