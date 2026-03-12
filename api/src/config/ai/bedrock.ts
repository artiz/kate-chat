import { ThinkingLevel } from "@/types/api";

export const AWS_BEDROCK_MODELS_SUPPORT_REASONING = [
  "anthropic.claude-opus-4",
  "anthropic.claude-sonnet-4",
  "anthropic.claude-3-7-sonnet",
];

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
