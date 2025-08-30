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

export enum UserRole {
  USER = "user",
  ADMIN = "admin",
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

export enum ModelType {
  CHAT = "chat",
  EMBEDDING = "embedding",
  IMAGE_GENERATION = "image_generation",
  AUDIO_GENERATION = "audio_generation",
  OTHER = "other",
}

export enum DocumentStatus {
  UPLOAD = "upload",
  STORAGE_UPLOAD = "storage_upload",
  PARSING = "parsing",
  CHUNKING = "chunking",
  EMBEDDING = "embedding",
  SUMMARIZING = "summarizing",
  READY = "ready",
  ERROR = "error",
  DELETING = "deleting",
}

export interface ParsedDocumentChunk {
  page: number;
  length_tokens: number;
  text: string;
  id: number; // index on page
  type: string; // "content" | "serialized_table"
}

export interface ParsedDocumentPage {
  page: number;
  text: string;
}

export interface ParsedJsonDocument {
  chunks: ParsedDocumentChunk[];
  pages: ParsedDocumentPage[];
}

export interface AIModelInfo {
  apiProvider: ApiProvider;
  provider: string;
  name: string;
  description?: string;
  type: ModelType;
  streaming?: boolean;
  imageInput?: boolean;
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

  @Field({ nullable: true })
  invocationLatency?: number;
}

@ObjectType()
export class ModelResponseMetadata {
  @Field(() => ModelResponseUsage, { nullable: true })
  usage?: ModelResponseUsage;
}

export class ModelResponse {
  metadata?: ModelResponseMetadata;
  type: ContentType;
  content: string;
  files?: string[];
}

export class EmbeddingsResponse {
  metadata?: ModelResponseMetadata;
  embedding: number[];
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
  imagesCount?: number;
};

export type GetEmbeddingsRequest = {
  modelId: string;
  input: string;
};

export interface BedrockModelServiceProvider<T = unknown> {
  getInvokeModelParams(request: InvokeModelParamsRequest): Promise<InvokeModelParamsResponse>;

  parseResponse(responseBody: T, request?: InvokeModelParamsRequest): ModelResponse;
}
