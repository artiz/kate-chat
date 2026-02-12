// Yandex AI API Configuration

import { ModelType } from "@/types/api";

export interface YandexModel {
  uri: string;
  name: string;
  description?: string;
  provider: string;
  maxInputTokens: number;
  imageInput?: boolean;
  type?: ModelType;
}

// Available models

export const YANDEX_MODELS: YandexModel[] = [
  {
    name: "YandexGPT 5 Pro",
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
    name: "YandexGPT 5.1 Pro",
    description: "YandexGPT PRO v5.1 model with improved performance",
    provider: "Yandex",
    uri: `gpt://{folder}/yandexgpt/rc`,
    maxInputTokens: 32_000,
  },
  {
    name: "Alice AI LLM",
    provider: "Yandex",
    uri: `gpt://{folder}/aliceai-llm/latest`,
    maxInputTokens: 128_000,
    imageInput: true,
  },
  {
    name: "Yandex Text embeddings 1",
    provider: "Yandex",
    uri: `emb://{folder}/text-embeddings/latest`,
    maxInputTokens: 128_000,
    type: ModelType.EMBEDDING,
  },
  {
    name: "YandexART",
    description:
      "YandexART is a multimodal model from Yandex, designed to create images and visual content based on a text description.",
    provider: "Yandex",
    uri: `art://{folder}/yandex-art/latest`,
    maxInputTokens: 128_000,
    type: ModelType.IMAGE_GENERATION,
  },
  {
    name: "Qwen3 235B",
    description: "FP8-optimized version of Qwen3 235B for high-performance tasks",
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
