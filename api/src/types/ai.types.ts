import "reflect-metadata";
import { Field, ID, ObjectType } from "type-graphql";
import { ApiProvider } from "@/config/ai/common";
import { MCPServer } from "@/entities";

export enum MessageType {
  MESSAGE = "message",
  SYSTEM = "system",
}

export enum ModelType {
  CHAT = "chat",
  EMBEDDING = "embedding",
  IMAGE_GENERATION = "image_generation",
  AUDIO_GENERATION = "audio_generation",
  REALTIME = "realtime",
  OTHER = "other",
}

export enum MessageRole {
  USER = "user",
  ASSISTANT = "assistant",
  ERROR = "error",
  SYSTEM = "system",
}

export enum ResponseStatus {
  STARTED = "started",
  IN_PROGRESS = "in_progress",
  RAG_SEARCH = "rag_search",
  WEB_SEARCH = "web_search",
  MCP_CALL = "mcp_call",
  CODE_INTERPRETER = "code_interpreter",
  TOOL_CALL = "tool_call",
  TOOL_CALL_COMPLETED = "tool_call_completed",
  OUTPUT_ITEM = "output_item",
  REASONING = "reasoning",
  CONTENT_GENERATION = "content_generation",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  ERROR = "error",
}

export enum DocumentStatus {
  UPLOAD = "upload",
  STORAGE_UPLOAD = "storage_upload",
  BATCHING = "batching",
  PARSING = "parsing",
  CHUNKING = "chunking",
  EMBEDDING = "embedding",
  SUMMARIZING = "summarizing",
  READY = "ready",
  ERROR = "error",
  DELETING = "deleting",
}

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
  tools?: ToolType[];
  features?: ModelFeature[];
}

export type ContentType = "text" | "image";

export interface ModelMessageContentText {
  content: string;
  contentType: "text";
}

export interface ModelMessageContentImage {
  contentType: "image";
  fileName: string;
  mimeType: string;
}

export interface ModelMessageContentVideo {
  contentType: "video";
  fileName: string;
  mimeType: string;
}

export type ModelMessageContent = ModelMessageContentText | ModelMessageContentImage | ModelMessageContentVideo;

export interface ModelMessage {
  role: MessageRole;
  body: string | ModelMessageContent[];
  metadata?: MessageMetadata;
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
  // --------------- assistant message meta ---------------
  // model usage details
  @Field({ nullable: true })
  requestId?: string;

  @Field(() => ModelResponseUsage, { nullable: true })
  usage?: ModelResponseUsage;

  // relevant document chunks selected by model sorted by relevance
  @Field(() => [MessageRelevantChunk], { nullable: true })
  relevantsChunks?: MessageRelevantChunk[];

  // Step by step analysis
  @Field(() => String, { nullable: true })
  analysis?: string;

  // tool calls
  @Field(() => [ChatToolCall], { nullable: true })
  toolCalls?: ChatToolCall[];
  // tool calls results
  @Field(() => [ChatToolCallResult], { nullable: true })
  tools?: ChatToolCallResult[];

  @Field(() => [ChatResultAnnotation], { nullable: true })
  annotations?: ChatResultAnnotation[];

  // --------------- user message meta ---------------
  // input document IDs
  @Field(() => [ID], { nullable: true })
  documentIds?: string[];
}

export interface ModelResponse {
  metadata?: MessageMetadata;
  type: ContentType;
  content: string;
  files?: string[];
}

export interface EmbeddingsResponse {
  metadata?: MessageMetadata;
  embedding: number[];
}

@ObjectType()
export class ChatToolCall {
  @Field()
  name: string;
  @Field()
  callId: string;
  @Field(() => String, { nullable: true })
  type?: "function" | "custom" | "mcp";
  @Field({ nullable: true })
  error?: string;
  @Field({ nullable: true })
  args?: string;
}

@ObjectType()
export class ChatToolCallResult {
  @Field()
  name: string;

  @Field()
  content: string;

  jsonContent?: ModelMessageContent[];

  @Field({ nullable: true })
  callId?: string;
}

@ObjectType()
export class ChatResultAnnotation {
  @Field()
  type: "url" | "file";

  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  source?: string;

  @Field({ nullable: true })
  startIndex?: number;

  @Field({ nullable: true })
  endIndex?: number;
}

export interface ChatResponseStatus {
  status?: ResponseStatus;
  sequence_number?: number;
  requestId?: string;
  detail?: string;
  tools?: ChatToolCallResult[];
  toolCalls?: ChatToolCall[];
}

export interface StreamCallbacks {
  onStart: (status?: ChatResponseStatus) => Promise<boolean | undefined>;
  onProgress: (token: string, status?: ChatResponseStatus, force?: boolean) => Promise<boolean | undefined>;
  onComplete: (response: ModelResponse, metadata?: MessageMetadata) => Promise<void | undefined>;
  onError: (error: Error) => Promise<boolean | undefined>;
}

export interface CompleteChatRequest {
  systemPrompt?: string;
  apiProvider: ApiProvider;
  modelId: string;
  modelType: ModelType;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  imagesCount?: number;
  tools?: ChatTool[];
  mcpServers?: MCPServer[];
  mcpTokens?: MCPAuthToken[];
}

export class MCPAuthToken {
  serverId?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;

  static of(authToken?: string, serverId?: string): MCPAuthToken | undefined {
    return authToken
      ? {
          serverId,
          accessToken: authToken,
        }
      : undefined;
  }
}

export interface GetEmbeddingsRequest {
  modelId: string;
  input: string;
  dimensions?: number;
}

export enum ToolType {
  WEB_SEARCH = "web_search",
  CODE_INTERPRETER = "code_interpreter",
  MCP = "mcp",
}

export enum ModelFeature {
  REQUEST_CANCELLATION = "request_cancellation",
  REASONING = "reasoning",
}

@ObjectType()
export class ChatToolOptions {
  @Field()
  name: string;

  @Field()
  value: string;
}

@ObjectType()
export class ChatTool {
  @Field(() => ToolType)
  type: ToolType;

  @Field()
  name: string;

  @Field({ nullable: true })
  id?: string;

  @Field(() => [ChatToolOptions], { nullable: true })
  options?: ChatToolOptions[];
}
