// Yandex AI API Configuration

// Base URL for Yandex API
export const YANDEX_API_URL = process.env.YANDEX_API_URL || "https://llm.api.cloud.yandex.net";

export const YANDEX_API_KEY = process.env.YANDEX_API_KEY;
export const YANDEX_API_FOLDER = process.env.YANDEX_API_FOLDER || "default";

export interface YandexModel {
  uri: string;
  name: string;
  description?: string;
  provider: string;
  maxInputTokens: number;
}

// Available models

export const YANDEX_MODELS: YandexModel[] = [
  {
    name: "YandexGPT Pro",
    description: "Latest YandexGPT PRO v5 model with enhanced capabilities",
    provider: "Yandex",
    uri: `gpt://${YANDEX_API_FOLDER}/yandexgpt/latest`,
    maxInputTokens: 8192,
  },
  {
    name: "YandexGPT Lite",
    provider: "Yandex",
    uri: `gpt://${YANDEX_API_FOLDER}/yandexgpt-lite/latest`,
    maxInputTokens: 8192,
  },
  {
    name: "Llama 8B",
    provider: "Meta",
    uri: `gpt://${YANDEX_API_FOLDER}/llama-lite`,
    maxInputTokens: 8192,
  },
  {
    name: "Llama 70B",
    provider: "Meta",
    uri: `gpt://${YANDEX_API_FOLDER}/llama`,
    maxInputTokens: 8192,
  },
];
