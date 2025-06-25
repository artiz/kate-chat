import "reflect-metadata";
import { Field, ObjectType } from "type-graphql";

export enum ApiProvider {
  AWS_BEDROCK = "aws_bedrock",
  OPEN_AI = "open_ai",
  YANDEX_FM = "yandex_fm",
}

export enum AuthProvider {
  LOCAL = "local",
  GOOGLE = "google",
  GITHUB = "github",
  MICROSOFT = "microsoft",
}

export enum MessageRole {
  USER = "user",
  ASSISTANT = "assistant",
  ERROR = "error",
  SYSTEM = "system",
}

export enum MessageType {
  MESSAGE = "message",
  SYSTEM = "system",
}

export type ContentType = "text" | "image" | "video" | "audio";
export interface ProviderInfo {
  id: ApiProvider;
  name: string;
  isConnected: boolean;
  costsInfoAvailable?: boolean;
  details: Record<string, string | number | boolean | undefined>;
}

export interface Amount {
  amount: number;
  currency: string;
}

export interface ServiceCostInfo {
  name: string;
  type: string; // e.g., "project", "service"
  amounts: Amount[];
}

export interface UsageCostInfo {
  start: Date;
  end?: Date;
  error?: string;
  costs: ServiceCostInfo[];
}

export interface AIModelInfo {
  apiProvider: ApiProvider;
  provider: string;
  name: string;
  description: string;
  supportsStreaming: boolean;
  supportsTextIn: boolean;
  supportsTextOut: boolean;
  supportsImageIn: boolean;
  supportsImageOut: boolean;
  supportsEmbeddingsIn: boolean;
}

export interface ModelMessageContent {
  content: string;
  contentType?: ContentType;
  fileName?: string;
  mimeType?: string;
}

export interface ModelMessage {
  role: MessageRole;
  body: string | ModelMessageContent[];
  timestamp?: Date;
}

@ObjectType()
export class ModelResponseUsage {
  @Field({ nullable: true })
  inputTokens?: number;

  @Field({ nullable: true })
  outputTokens?: number;

  @Field({ nullable: true })
  cacheReadInputTokens?: number;

  @Field({ nullable: true })
  cacheWriteInputTokens?: number;
}

@ObjectType()
export class ModelResponseMetadata {
  @Field(() => ModelResponseUsage, { nullable: true })
  usage?: ModelResponseUsage;
}

export class ModelResponse {
  metadata?: ModelResponseMetadata;
  // TODO: Add support for > 1 image
  type: ContentType;
  content: string;
}

export interface StreamCallbacks {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onComplete?: (content: string, metadata?: ModelResponseMetadata) => void;
  onError?: (error: Error) => void;
}

export type InvokeModelParamsResponse = {
  modelId: string;
  body: string;
};

export type InvokeModelParamsRequest = {
  systemPrompt?: string;
  messages?: ModelMessage[];
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  imageBase64?: string;
};

export interface BedrockModelServiceProvider<T = unknown> {
  getInvokeModelParams(request: InvokeModelParamsRequest): Promise<InvokeModelParamsResponse>;

  parseResponse(responseBody: T, request?: InvokeModelParamsRequest): ModelResponse;
}
