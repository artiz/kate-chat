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

// Voices of the realtime model (Speech Realtime Max TTS Live). AI Studio's docs list none for it: denis is
// the voice its session.created reports, and it rejects the SpeechKit voices of the removed
// speech-realtime-250923 ("Cannot change voice to marina"). Add the others here once they are confirmed.
export const YANDEX_REALTIME_VOICES = ["denis"];

export const YANDEX_REALTIME_DEFAULT_VOICE = "denis";

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
    // text in, text out: the image input of the Alice family lives in other models
    provider: "Yandex",
    uri: `gpt://{folder}/aliceai-llm/latest`,
    maxInputTokens: 128_000,
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
    // the reasoning text model; vision is DeepSeek-VL2, which AI Studio serves separately
    provider: "DeepSeek",
    uri: `gpt://{folder}/deepseek-v32/latest`,
    maxInputTokens: 131_072,
    apiType: "responses",
    features: [ModelFeature.REASONING, ModelFeature.REASONING_CANCELLATION],
  },
  {
    // speech-realtime-250923 is gone from AI Studio: the realtime API answers it with model_access_denied
    name: "Speech Realtime Max TTS Live",
    description: "Yandex AI Studio's voice model for voice assistants over the Realtime API",
    provider: "Yandex",
    uri: `gpt://{folder}/speech-realtime-max-tts-live`,
    maxInputTokens: 32_768,
    type: ModelType.REALTIME,
    apiType: "responses",
  },
];
