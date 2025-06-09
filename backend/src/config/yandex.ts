// Yandex AI API Configuration

// Base URL for Yandex API
export const YANDEX_API_URL = process.env.YANDEX_API_URL || "https://llm.api.cloud.yandex.net";

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
    uri: `gpt://{folder}/yandexgpt/latest`,
    maxInputTokens: 8192,
  },
  {
    name: "YandexGPT Lite",
    provider: "Yandex",
    uri: `gpt://{folder}/yandexgpt-lite/latest`,
    maxInputTokens: 8192,
  },
  {
    name: "Llama 8B",
    provider: "Meta",
    uri: `gpt://{folder}/llama-lite`,
    maxInputTokens: 8192,
  },
  {
    name: "Llama 70B",
    provider: "Meta",
    uri: `gpt://{folder}/llama`,
    maxInputTokens: 8192,
  },
];
