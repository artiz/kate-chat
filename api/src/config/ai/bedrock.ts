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

export const AWS_BEDROCK_DEFAULT_THINKING_LEVELS: Record<ThinkingLevel, number> = {
  minimal: AWS_BEDROCK_MIN_THINKING_BUDGET,
  low: 2048,
  medium: 8192,
  high: AWS_BEDROCK_MAX_THINKING_BUDGET,
  xhigh: AWS_BEDROCK_MAX_THINKING_BUDGET,
};
