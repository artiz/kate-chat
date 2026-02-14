import i18n, { Resource } from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { merge } from "lodash";

import en from "./locales/en.json";
import de from "./locales/de.json";
import ru from "./locales/ru.json";
import zh from "./locales/zh.json";

const SUPPORTED_LANGUAGES = ["en", "de", "ru", "zh"] as const;
export const LANGUAGE_STORAGE_KEY = "ui-language";

interface InitI18nProps {
  lookupLocalStorage?: string;
  supportedLngs?: readonly string[];
  fallbackLng?: string;
  resources?: Resource;
}

function mergeResources(mainResource: Resource = {}) {
  return merge(
    {
      en: { translation: en },
      de: { translation: de },
      ru: { translation: ru },
      zh: { translation: zh },
    },
    mainResource
  );
}

export async function initI18n({
  lookupLocalStorage = LANGUAGE_STORAGE_KEY,
  supportedLngs = SUPPORTED_LANGUAGES,
  fallbackLng = "en",
  resources = {},
}: InitI18nProps = {}) {
  return i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: mergeResources(resources),
      fallbackLng,
      supportedLngs,
      interpolation: {
        escapeValue: false,
      },
      detection: {
        order: ["localStorage", "navigator", "htmlTag"],
        lookupLocalStorage,
        caches: ["localStorage"],
      },
    });
}

export function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(i18n.language || "ru-RU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
