import { ThinkingLevel } from "@/types/api";

export const AWS_BEDROCK_MODELS_SUPPORT_REASONING = [
  "anthropic.claude-opus-4",
  "anthropic.claude-sonnet-4",
  "anthropic.claude-sonnet-5",
  "anthropic.claude-fable-5",
  "anthropic.claude-haiku-4-5",
  "anthropic.claude-3-7-sonnet",
];

// Models that reject `budget_tokens` extended thinking (HTTP 400) and only accept
// adaptive thinking. Reasoning depth is controlled via `output_config.effort` instead
// of a fixed token budget. Everything else keeps the budget_tokens path.
export const AWS_BEDROCK_MODELS_ADAPTIVE_THINKING_ONLY = [
  "anthropic.claude-opus-4-7",
  "anthropic.claude-opus-4-8",
  "anthropic.claude-sonnet-5",
  "anthropic.claude-fable-5",
];

// Models accepting Converse document blocks (inline chat-context files)
export const AWS_BEDROCK_MODELS_SUPPORT_DOCUMENTS = ["anthropic.claude", "amazon.nova"];

export const AWS_BEDROCK_MODELS_SUPPORT_CACHE_RETENTION = [
  "anthropic.claude-opus-4",
  "anthropic.claude-sonnet-4",
  "anthropic.claude-3-7-sonnet",
  "anthropic.claude-3-5-haiku",
  "anthropic.claude-3-5-sonnet",
];

export const AWS_BEDROCK_MIN_THINKING_BUDGET = 1024;
export const AWS_BEDROCK_MAX_THINKING_BUDGET = 16384;
// Output limit for extended thinking when the request sets none (skill answers): Anthropic requires
// one above the thinking budget, and every Claude model with extended thinking allows at least this
export const AWS_BEDROCK_THINKING_MAX_TOKENS = 32000;

// Output limit asked for when an answer should have the model's own (skill programs): Bedrock does
// not default to the model's maximum (Claude answers stop at 4096). A model with a lower limit
// rejects it; the provider then retries with the limit the error names and remembers it.
export const AWS_BEDROCK_UNLIMITED_OUTPUT_TOKENS = 64000;

/** The model's output limit from Bedrock's error for too many requested tokens, if it names one. */
export function outputLimitFromError(error: unknown, requested: number): number | undefined {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!/token/i.test(message)) return undefined;
  const limits = [...message.matchAll(/\d{3,7}/g)].map(match => Number(match[0])).filter(n => n < requested);
  return limits.length ? Math.max(...limits) : undefined;
}

export const AWS_BEDROCK_DEFAULT_THINKING_LEVELS: Record<ThinkingLevel, number> = {
  minimal: AWS_BEDROCK_MIN_THINKING_BUDGET,
  low: 2048,
  medium: 8192,
  high: AWS_BEDROCK_MAX_THINKING_BUDGET,
  xhigh: AWS_BEDROCK_MAX_THINKING_BUDGET,
};
