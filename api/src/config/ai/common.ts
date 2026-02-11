import { globalConfig } from "@/global-config";

// must be in sync with packages/katechat-ui/src/core/ai.ts
export enum ApiProvider {
  AWS_BEDROCK = "AWS_BEDROCK",
  OPEN_AI = "OPEN_AI",
  YANDEX_FM = "YANDEX_FM",
  CUSTOM_REST_API = "CUSTOM_REST_API",
  // GOOGLE_VERTEX_AI = "GOOGLE_VERTEX_AI",
  // DEEPSEEK = "DEEPSEEK",
  // ANTHROPIC = "ANTHROPIC"
}

const cfg = globalConfig.values;

export const DEFAULT_TEMPERATURE = cfg.ai.defaultTemperature;
export const DEFAULT_MAX_TOKENS = cfg.ai.defaultMaxTokens;
export const DEFAULT_TOP_P = cfg.ai.defaultTopP;

export const CONTEXT_MESSAGES_LIMIT = cfg.ai.contextMessagesLimit;
export const EMBEDDINGS_DIMENSIONS = cfg.ai.embeddingsDimensions ?? (cfg.env.db.type === "mssql" ? 1998 : 3072);

// https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them
export const CHARACTERS_PER_TOKEN = cfg.ai.charactersPerToken;
export const MAX_CONTEXT_TOKENS = cfg.ai.maxContextTokens;

export const SUMMARIZING_OUTPUT_TOKENS = cfg.ai.summarizingOutputTokens;
export const SUMMARIZING_TEMPERATURE = cfg.ai.summarizingTemperature;

export const RAG_QUERY_CHUNKS_LIMIT = cfg.ai.ragQueryChunksLimit;
export const RAG_LOAD_FULL_PAGES = cfg.ai.ragLoadFullPages;

export const ENABLED_API_PROVIDERS: ApiProvider[] = (() => {
  const allIds: ApiProvider[] = Object.values(ApiProvider);
  const enabledList = cfg.providers.enabled || [];
  const hasWildcard = enabledList.length === 1 && (enabledList as string[])[0] === "*";
  const enabledIds = new Set(enabledList.map(id => id.toString().trim().toUpperCase()));
  return hasWildcard ? allIds : allIds.filter(id => enabledIds.has(id));
})();
