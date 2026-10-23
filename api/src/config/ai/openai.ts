// OpenAI Configuration

export const OPENAI_MODELS_SUPPORT_RESPONSES_API = [
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5-chat",
  "gpt-5-codex",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o",
  "gpt-4o-mini",
  "o1",
  "o3",
  "o3-mini",
  "o4-mini",
  "gpt-image-1",
];

export const OPENAI_MODELS_SUPPORT_IMAGES_INPUT = [
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5-chat",
  "gpt-5-codex",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o",
  "gpt-4o-mini",
  "o1",
  "o3",
  "o3-mini",
  "o4-mini",
  "gpt-image",
];

export const OPENAI_MODELS_SUPPORT_REASONING = ["gpt-5", "o1", "o3", "o4"];
export const OPENAI_MODELS_SUPPORT_TOOL_CODE_INTERPRETER = ["gpt-5.2", "gpt-5.1", "gpt-4.1", "gpt-4o", "gpt-4o-mini"];

export const OPENAI_MODELS_SUPPORT_TOOL_IMAGE_GENERATION = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "o3",
  "gpt-5",
  "gpt-5-nano",
  "gpt-5.2",
];

/**
 * Models OpenAI shuts down, with the shutdown date from https://developers.openai.com/api/docs/deprecations.
 * An account's models list can still name them, but calls fail with 404 "The model ... has been
 * deprecated", so the models list leaves each out from its shutdown date on (see isDeprecatedOpenAIModel).
 */
export const OPENAI_DEPRECATED_MODELS: Record<string, string> = {
  "babbage-002": "2026-09-28",
  "davinci-002": "2026-09-28",
  "gpt-3.5-turbo-instruct": "2026-09-28",
  "gpt-3.5-turbo-1106": "2026-09-28",
  // the alias, with gpt-3.5-turbo-0125
  "gpt-3.5-turbo": "2026-10-23",
  // the alias of gpt-3.5-turbo-16k-0613 (shut down 2024-09-13), which the page does not name itself
  "gpt-3.5-turbo-16k": "2026-10-23",
  // the alias, with gpt-4-0613
  "gpt-4": "2026-10-23",
  "gpt-4-turbo": "2026-10-23",
  "gpt-4o-2024-05-13": "2026-10-23",
  "chatgpt-4o-latest": "2026-02-17",
  "gpt-4o-audio-preview": "2026-05-07",
  "gpt-4o-realtime-preview": "2026-05-07",
  "gpt-4o-search-preview": "2026-07-23",
  "gpt-4o-mini-search-preview": "2026-07-23",
  "gpt-5-chat-latest": "2026-07-23",
  "gpt-5.1-chat-latest": "2026-07-23",
  "gpt-5.2-chat-latest": "2026-08-10",
  "codex-mini-latest": "2026-02-12",
  o1: "2026-10-23",
  "o1-pro": "2026-10-23",
  "o3-deep-research": "2026-07-23",
  "dall-e-2": "2026-05-12",
  "dall-e-3": "2026-05-12",
  "gpt-image-1": "2026-10-23",
  "tts-1": "2027-01-06",
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether OpenAI has shut the model down by `now`. An entry covers the model and its dated snapshots
 * (gpt-4 also covers gpt-4-0613, o1 covers o1-2024-12-17), not other models whose IDs start the same
 * way: gpt-4 does not cover gpt-4o or gpt-4.1, and gpt-image-1 does not cover gpt-image-1-mini.
 */
export function isDeprecatedOpenAIModel(modelId: string, now: Date = new Date()): boolean {
  const today = now.toISOString().slice(0, 10);
  return Object.entries(OPENAI_DEPRECATED_MODELS).some(
    ([id, shutdown]) =>
      today >= shutdown &&
      (modelId === id || new RegExp(`^${escapeRegExp(id)}-(\\d{4}|\\d{4}-\\d{2}-\\d{2})$`).test(modelId))
  );
}

export const OPENAI_MODELS_IMAGES_GENERATION = ["dall-e", "chatgpt-image", "gpt-image"];

export const OPENAI_MODELS_VIDEO_GENERATION = ["sora-2", "sora-2-pro"];

export const OPENAI_MODELS_AUDIO_GENERATION = ["gpt-4o-audio", "gpt-4o-mini-audio", "tts-1"];

// chat models accepting voice recordings as input and able to reply with speech audio
export const OPENAI_MODELS_AUDIO_INPUT = ["gpt-4o-audio", "gpt-4o-mini-audio", "gpt-audio"];

export const OPENAI_MODELS_TRANSCRIPTION = ["whisper"];

// speech-to-text model used to transcribe realtime voice sessions
export const OPENAI_REALTIME_TRANSCRIPTION_MODEL = "whisper-1";

export const OPENAI_REALTIME_VOICES = [
  "marin",
  "cedar",
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
];

export const OPENAI_REALTIME_DEFAULT_VOICE = "shimmer";

export const OPENAI_MODEL_MAX_INPUT_TOKENS: { [key: string]: number } = {
  "gpt-5": 400_000,
  "gpt-4": 8192,
  "gpt-4-0314": 8192,
  "gpt-4-0613": 8192,
  "gpt-4-32k": 32768,
  "gpt-4-32k-0314": 32768,
  "gpt-4-32k-0613": 32768,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4o-audio": 128000,
  "gpt-4o-mini-audio": 128000,
  "gpt-4o-realtime": 128000,
  "gpt-4o-mini-realtime": 128000,
  "gpt-3.5-turbo": 4096,
  "gpt-3.5-turbo-0301": 4096,
  "gpt-3.5-turbo-0613": 4096,
  "gpt-3.5-turbo-16k": 16384,
  "gpt-3.5-turbo-16k-0613": 16384,
  "gpt-3.5-turbo-instruct": 4096,
  "text-davinci-003": 4097,
  "text-davinci-002": 4097,
  "text-curie-001": 2049,
  "text-babbage-001": 2049,
  "text-ada-001": 2049,
  "code-davinci-002": 8001,
  "code-davinci-001": 8001,
  "code-cushman-002": 8001,
  "code-cushman-001": 8001,
  "text-embedding-3-small": 8191,
  "text-embedding-3-large": 8191,
  "text-embedding-2-large": 8191,
  "text-embedding-2-small": 8191,
  "text-similarity-3-small": 8191,
  "text-similarity-3-large": 8191,
  "text-similarity-2-large": 8191,
  "text-similarity-2-small": 8191,
  "text-search-3-small": 8191,
  "text-search-3-large": 8191,
  "text-search-2-large": 8191,
  "text-search-2-small": 8191,
  "code-search-3-small": 8191,
  "code-search-3-large": 8191,
  "code-search-2-large": 8191,
  "code-search-2-small": 8191,
};
