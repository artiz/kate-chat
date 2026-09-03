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

// SpeechKit voices supported by speech-realtime models
export const YANDEX_REALTIME_VOICES = [
  "alena",
  "marina",
  "jane",
  "omazh",
  "filipp",
  "ermil",
  "zahar",
  "madirus",
  "dasha",
  "julia",
  "lera",
  "masha",
  "alexander",
  "kirill",
  "anton",
];

export const YANDEX_REALTIME_DEFAULT_VOICE = "marina";

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
    name: "Alice AI LLM Flash",
    description: "Lightweight Alice AI LLM for fast text processing and RAG scenarios",
    provider: "Yandex",
    uri: `gpt://{folder}/aliceai-llm-flash/latest`,
    maxInputTokens: 128_000,
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
    name: "DeepSeek V4 Flash",
    description: "DeepSeek V4 Flash, recommended by Yandex AI Studio for agentic scenarios",
    provider: "DeepSeek",
    uri: `gpt://{folder}/deepseek-v4-flash/latest`,
    maxInputTokens: 131_072,
    apiType: "responses",
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
