import { ApiProvider } from "@/types/ai.types";

export const DEFAULT_PROMPT = `You a experienced software developer. 
Being asked about code examples please always comment tricky moments and generate most effective and secure code.
In case of formulas output always use MatJAX format.`;

export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = 2048;
export const DEFAULT_TOP_P = 0.9;

export const CONTEXT_MESSAGES_LIMIT = 100;

export const ENABLED_API_PROVIDERS: ApiProvider[] = (() => {
  const allIds: ApiProvider[] = Object.values(ApiProvider);
  const enabledIds = new Set(process.env.ENABLED_API_PROVIDERS?.split(",").map(id => id.trim()) || []);
  return process.env.ENABLED_API_PROVIDERS === "*" ? allIds : allIds.filter(id => enabledIds.has(id));
})();
