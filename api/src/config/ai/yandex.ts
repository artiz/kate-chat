// Yandex AI API Configuration

// Base URL for Yandex API
export const YANDEX_FM_API_URL = process.env.YANDEX_FM_API_URL || "https://llm.api.cloud.yandex.net";
export const YANDEX_FM_OPENAI_API_URL = process.env.YANDEX_FM_OPENAI_API_URL || "https://llm.api.cloud.yandex.net/v1";
export const YANDEX_SEARCH_API_URL =
  process.env.YANDEX_SEARCH_API_URL || "https://searchapi.api.cloud.yandex.net/v2/web/search";

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
    maxInputTokens: 32_000,
  },
  {
    name: "YandexGPT Lite",
    provider: "Yandex",
    uri: `gpt://{folder}/yandexgpt-lite/latest`,
    maxInputTokens: 32_000,
  },
  {
    name: "Qwen3 235B",
    provider: "Alibaba Cloud",
    uri: `gpt://{folder}/qwen3-235b-a22b-fp8/latest`,
    maxInputTokens: 256_000,
  },
  {
    name: "Gemma3 27B",
    provider: "Google",
    uri: `gpt://{folder}/gemma-3-27b-it/latest`,
    maxInputTokens: 128_000,
  },
  {
    name: "gpt-oss-120b",
    provider: "OpenAI",
    uri: `gpt://{folder}/gpt-oss-120b/latest`,
    maxInputTokens: 128_000,
  },
  {
    name: "gpt-oss-20b",
    provider: "OpenAI",
    uri: `gpt://{folder}/gpt-oss-20b/latest`,
    maxInputTokens: 128_000,
  },
];
