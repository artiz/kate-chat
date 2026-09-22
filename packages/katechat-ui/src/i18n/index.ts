import i18n, { Resource } from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { merge } from "lodash";

import en from "./locales/en.json";
import de from "./locales/de.json";
import ru from "./locales/ru.json";
import zh from "./locales/zh.json";

export const BASE_SUPPORTED_LANGUAGES: string[] = ["en", "de", "ru", "zh"] as const;
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
  supportedLngs = BASE_SUPPORTED_LANGUAGES,
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

/**
 * Zone the UI renders dates in: the user's setting when they have one, the browser's otherwise.
 * Kept here next to the language for the same reason — every formatter needs it and threading it
 * through the component tree would touch every screen that shows a date.
 */
let appTimeZone: string | undefined;

export const setAppTimeZone = (timeZone?: string): void => {
  appTimeZone = timeZone || undefined;
};

export const getAppTimeZone = (): string => appTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function formatDate(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toLocaleDateString(i18n.language || "ru-RU", {
    timeZone: getAppTimeZone(),
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Day and wall-clock time to the second, for a message or a file the user is looking at. */
export function formatDateTime(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toLocaleString(i18n.language || undefined, {
    timeZone: getAppTimeZone(),
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Day only, for lists where the time adds nothing. */
export function formatDay(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toLocaleDateString(i18n.language || undefined, { timeZone: getAppTimeZone() });
}
