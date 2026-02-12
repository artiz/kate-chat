// must be in sync with packages/katechat-ui/src/core/ai.ts
export enum ApiProvider {
  AWS_BEDROCK = "AWS_BEDROCK",
  OPEN_AI = "OPEN_AI",
  YANDEX_FM = "YANDEX_FM",
  CUSTOM_REST_API = "CUSTOM_REST_API",
  // GOOGLE_VERTEX_AI = "GOOGLE_VERTEX_AI",
  // DEEPSEEK = "DEEPSEEK",
  // ANTHROPIC = "ANTHROPIC",
}

export enum MessageType {
  MESSAGE = "message",
  SYSTEM = "system",
}

export enum ModelType {
  CHAT = "chat",
  EMBEDDING = "embedding",
  IMAGE_GENERATION = "image_generation",
  VIDEO_GENERATION = "video_generation",
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

export enum ToolType {
  WEB_SEARCH = "web_search",
  CODE_INTERPRETER = "code_interpreter",
  MCP = "mcp",
}

export enum ModelFeature {
  REQUEST_CANCELLATION = "request_cancellation",
  REASONING = "reasoning",
}

export enum MCPTransportType {
  STREAMABLE_HTTP = "STREAMABLE_HTTP",
  HTTP_SSE_LEGACY = "HTTP_SSE_LEGACY",
}

export enum MCPAuthType {
  NONE = "NONE",
  API_KEY = "API_KEY",
  BEARER = "BEARER",
  OAUTH2 = "OAUTH2",
}
