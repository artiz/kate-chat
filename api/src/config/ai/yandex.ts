// Yandex AI API Configuration

import { OpenAIApiType } from "@/services/ai/protocols/openai.protocol";
import { ModelFeature, ModelType } from "@/types/api";

export interface YandexModel {
  uri: string;
  name: string;
  description?: string;
  provider: string;
  maxInputTokens: number;
  imageInput?: boolean;
  type?: ModelType;
  apiType?: OpenAIApiType;
  features?: ModelFeature[];
}

// Available models

export const YANDEX_MODELS: YandexModel[] = [
  {
    name: "YandexGPT 5 Pro",
    description: "Latest YandexGPT PRO v5 model with enhanced capabilities",
    provider: "Yandex",
    uri: `gpt://{folder}/yandexgpt/latest`,
    maxInputTokens: 32_000,
    apiType: "responses",
  },
  {
    name: "YandexGPT Lite",
    provider: "Yandex",
    uri: `gpt://{folder}/yandexgpt-lite/latest`,
    maxInputTokens: 32_000,
    apiType: "responses",
  },
  {
    name: "YandexGPT 5.1 Pro",
    description: "YandexGPT PRO v5.1 model with improved performance",
    provider: "Yandex",
    uri: `gpt://{folder}/yandexgpt/rc`,
    maxInputTokens: 32_000,
    apiType: "responses",
  },
  {
    name: "Alice AI LLM",
    provider: "Yandex",
    uri: `gpt://{folder}/aliceai-llm/latest`,
    maxInputTokens: 128_000,
    imageInput: true,
    apiType: "responses",
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
    apiType: "responses",
  },
  {
    name: "Gemma 3 27B IT",
    provider: "Google",
    uri: `gpt://{folder}/gemma-3-27b-it/latest`,
    maxInputTokens: 128_000,
  },
  {
    name: "GPT OSS 120B",
    provider: "OpenAI",
    uri: `gpt://{folder}/gpt-oss-120b/latest`,
    maxInputTokens: 128_000,
  },
  {
    name: "GPT OSS 20B",
    provider: "OpenAI",
    uri: `gpt://{folder}/gpt-oss-20b/latest`,
    maxInputTokens: 128_000,
  },
  {
    name: "DeepSeek 3.2",
    provider: "DeepSeek",
    uri: `gpt://{folder}/deepseek-v32/latest`,
    maxInputTokens: 131_072,
    imageInput: true,
    apiType: "responses",
    features: [ModelFeature.REASONING, ModelFeature.REASONING_CANCELLATION],
  },
  {
    name: "Yandex Speech Realtime v250923",
    provider: "Yandex",
    uri: `gpt://{folder}/speech-realtime-250923/latest`,
    maxInputTokens: 32_768,
    type: ModelType.REALTIME,
    apiType: "responses",
  },
];
