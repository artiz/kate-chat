import { User } from "./user";
import { ChatFile } from "./chat-file";

export enum MessageType {
  MESSAGE = "message",
  SYSTEM = "system",
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
  CODE_INTERPRETER = "code_interpreter",
  TOOL_CALL = "tool_call",
  TOOL_CALL_COMPLETED = "tool_call_completed",
  REASONING = "reasoning",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  ERROR = "error",
}

export interface Message<TUser = User, TMetadata = Record<string, unknown>, TChatFile = ChatFile> {
  id: string;
  chatId: string;
  content: string;
  html?: string[];
  role: MessageRole;
  modelId?: string;
  modelName?: string;
  user?: TUser;
  createdAt: string;
  updatedAt: string;
  streaming?: boolean;
  linkedToMessageId?: string;
  linkedMessages?: Message<TUser, TMetadata, TChatFile>[];
  metadata?: TMetadata;
  status?: ResponseStatus;
  statusInfo?: string;
  files?: TChatFile[];
}

export interface PluginProps<TMessage = Message> {
  message: TMessage;
  disabled?: boolean;
  onAddMessage?: (message: TMessage) => void;
  onAction?: (messageId: string) => void;
  onActionEnd?: (messageId: string) => void;
  onMessageDeleted?: (args: { messagesToDelete?: TMessage[]; deleteAfter?: TMessage }) => void;
}

export interface ImageInput {
  fileName: string;
  mimeType: string;
  bytesBase64: string;
}
