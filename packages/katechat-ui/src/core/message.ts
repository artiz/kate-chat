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
  IN_PROGRESS = "in_progress",
  WEB_SEARCH = "web_search",
  CODE_INTERPRETER = "code_interpreter",
  TOOL_CALL = "tool_call",
  TOOL_CALL_COMPLETED = "tool_call_completed",
  REASONING = "reasoning",
  COMPLETED = "completed",
  ERROR = "error",
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  defaultModelId?: string;
}

export interface Message<TUser = User, TMetadata = Record<string, unknown>> {
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
  linkedMessages?: Message<TUser, TMetadata>[];
  metadata?: TMetadata;
  status?: ResponseStatus;
  statusInfo?: string;
}

export interface PluginProps<TMessage = Message> {
  message: TMessage;
  disabled?: boolean;
  onAddMessage?: (message: TMessage) => void;
  onAction?: (messageId: string) => void;
  onActionEnd?: (messageId: string) => void;
  onMessageDeleted?: (args: { messagesToDelete?: TMessage[]; deleteAfter?: TMessage }) => void;
}
