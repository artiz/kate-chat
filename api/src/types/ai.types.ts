import "reflect-metadata";
import { Field, ID, ObjectType } from "type-graphql";

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
  maxInputTokens?: number;
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
export class MessageRelevantChunk {
  @Field(() => ID)
  id: string;

  @Field()
  relevance: number;

  @Field()
  documentId: string;

  @Field({ nullable: true })
  documentName?: string;

  @Field()
  page: number;

  @Field()
  pageIndex: number;

  @Field()
  content: string;
}

@ObjectType()
export class MessageMetadata {
  ///////////// assistant message meta
  // model usage details
  @Field(() => ModelResponseUsage, { nullable: true })
  usage?: ModelResponseUsage;

  // relevant document chunks selected by model sorted by relevance
  @Field(() => [MessageRelevantChunk], { nullable: true })
  relevantsChunks?: MessageRelevantChunk[];

  // Step by step analysis
  @Field(() => String, { nullable: true })
  analysis?: string;

  ///////////// user message meta
  // input document IDs
  @Field(() => [ID], { nullable: true })
  documentIds?: string[];
}

export class ModelResponse {
  metadata?: MessageMetadata;
  type: ContentType;
  content: string;
  files?: string[];
}

export class EmbeddingsResponse {
  metadata?: MessageMetadata;
  embedding: number[];
}

export interface StreamCallbacks {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onComplete?: (content: string, metadata?: MessageMetadata) => void;
  onError?: (error: Error) => void;
}

export type CompleteChatRequest = {
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
  dimensions?: number;
};
