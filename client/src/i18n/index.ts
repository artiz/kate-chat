import { initI18n, LANGUAGE_STORAGE_KEY } from "@katechat/ui";
import en from "./locales/en.json";
import de from "./locales/de.json";
import ru from "./locales/ru.json";
import zh from "./locales/zh.json";

export { LANGUAGE_STORAGE_KEY };
export const SUPPORTED_LANGUAGES = ["en", "de", "ru", "zh"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const I18N_RESOURCES = {
  en: { translation: en },
  de: { translation: de },
  ru: { translation: ru },
  zh: { translation: zh },
};

const i18n = initI18n({
  resources: I18N_RESOURCES,
});

export default i18n;
