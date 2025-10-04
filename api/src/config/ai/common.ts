import { ApiProvider } from "../../types/ai.types";

export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = 2048;
export const DEFAULT_TOP_P = 0.9;

export const CONTEXT_MESSAGES_LIMIT = 100;
export const EMBEDDINGS_DIMENSIONS = process.env.DB_TYPE === "mssql" ? 1998 : 3072;

// https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them
export const CHARACTERS_PER_TOKEN = 3.5;

export const SUMMARIZING_OUTPUT_TOKENS = 2000;
export const SUMMARIZING_TEMPERATURE = 0.25;

export const RAG_QUERY_CHUNKS_LIMIT = process.env.RAG_QUERY_CHUNKS_LIMIT
  ? parseInt(process.env.RAG_QUERY_CHUNKS_LIMIT, 10)
  : 10;
export const RAG_LOAD_FULL_PAGES = ["1", "true", "y", "yes"].includes(
  (process.env.RAG_LOAD_FULL_PAGES || "yes").toLowerCase()
);

export const ENABLED_API_PROVIDERS: ApiProvider[] = (() => {
  const allIds: ApiProvider[] = Object.values(ApiProvider);
  const enabledIds = new Set(process.env.ENABLED_API_PROVIDERS?.split(",").map(id => id.trim()) || []);
  return process.env.ENABLED_API_PROVIDERS === "*" ? allIds : allIds.filter(id => enabledIds.has(id));
})();
