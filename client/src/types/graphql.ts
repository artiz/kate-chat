import { User } from "@/store/slices/userSlice";
import { DocumentStatus, MessageRole } from "./ai";
import { Model, ProviderInfo } from "@/store/slices/modelSlice";

export interface CurrentUserResponse {
  currentUser: User;
}

export interface GetModelsResponse {
  getModels: {
    models: Model[];
    providers?: ProviderInfo[];
  };
}

export interface GetChatsResponse {
  getChats: {
    chats: Chat[];
    total: number;
    hasMore: boolean;
  };
}

export interface GetChatMessagesResponse {
  getChatMessages: {
    chat: Chat;
    messages: Message[];
    total: number;
    hasMore: boolean;
    error?: string;
  };
}

export interface LibraryImage {
  id: string;
  fileName: string;
  fileUrl: string;
  role: MessageRole;
  mimeType: string;
  createdAt: string;
  message: {
    id: string;
    content: string;
  };
  chat: {
    id: string;
    title: string;
  };
}

export interface GetAllImagesResponse {
  getAllImages: {
    images: LibraryImage[];
    total: number;
    nextPage?: number;
    error?: string;
  };
}

export interface GetImagesInput {
  offset?: number;
  limit?: number;
}

export interface GetDocumentsInput {
  offset?: number;
  limit?: number;
  searchTerm?: string;
}

export interface GetDocumentsResponse {
  getDocuments: {
    documents: Document[];
    total: number;
    hasMore: boolean;
  };
}

export interface GetDocumentsForChatResponse {
  getDocuments: {
    documents: Document[];
    total: number;
    hasMore: boolean;
  };
  chatById: Chat | null | undefined;
}

export interface ImageInput {
  fileName: string;
  mimeType: string;
  bytesBase64: string;
}

export interface CreateChatInput {
  title?: string;
  description?: string;
  modelId?: string;
  systemPrompt?: string;
}

export interface ApplicationConfig {
  currentUser: User;
  token: string;
  demoMode: boolean;
  s3Connected: boolean;
  ragSupported: boolean;
  ragEnabled: boolean;
  maxChats?: number;
  maxChatMessages?: number;
  maxImages?: number;
  lastUpdate?: number;
}

export interface GetInitialDataResponse {
  data: {
    getModels: {
      models: Model[];
      providers?: ProviderInfo[];
    };
    getChats: {
      chats: Chat[];
      total: number;
      hasMore: boolean;
    };
    appConfig: ApplicationConfig;
  };
}

export interface GqlAmount {
  amount: number;
  currency: string;
}

export interface GqlServiceCostInfo {
  name: string;
  type: string;
  amounts: GqlAmount[];
}

export interface GqlCostsInfo {
  start: Date;
  end?: Date;
  error?: string;
  costs: GqlServiceCostInfo[];
}

export interface DeleteMessageResponse {
  deleteMessage: {
    messages: Message[];
  };
}

export interface SwitchModelResponse {
  switchModel: {
    message: Message;
    error?: string;
  };
}

export interface EditMessageResponse {
  editMessage: {
    message?: Message;
    error?: string;
  };
}

export interface CallOthersInput {
  messageId: string;
  modelIds: string[];
}

export interface CallOthersResponse {
  callOther: {
    message?: Message;
    error?: string;
  };
}

export interface MessageRelevantChunk {
  id: string;
  relevance: number;
  documentId: string;
  documentName?: string;
  page: number;
  pageIndex: number;
  content: string;
}

export interface MessageMetadata {
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };

  documentIds?: string[];
  relevantsChunks?: MessageRelevantChunk[];
}

export enum ResponseStatus {
  IN_PROGRESS = "in_progress",
  WEB_SEARCH = "web_search",
  CODE_INTERPRETER = "code_interpreter",
  TOOL_CALL = "tool_call",
  REASONING = "reasoning",
  COMPLETED = "completed",
  ERROR = "error",
}

export interface Message {
  id: string;
  chatId: string;
  content: string;
  html?: string[];
  role: MessageRole;
  modelId?: string;
  modelName?: string;
  user?: User;
  createdAt: string;
  updatedAt: string;
  streaming?: boolean;
  linkedToMessageId?: string;
  linkedMessages?: Message[];
  metadata?: MessageMetadata;
  status?: ResponseStatus;
  statusInfo?: string;
}

export interface MessageChatInfo {
  title?: string;
  modelId?: string;
  isPristine?: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  imagesCount?: number;
}

export interface Chat {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
  modelId?: string;
  isPristine?: boolean;
  isPinned?: boolean;
  messagesCount: number;
  lastBotMessage?: string;
  lastBotMessageId?: string;
  lastBotMessageHtml?: string[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  imagesCount?: number;
  chatDocuments?: ChatDocument[];
  user?: User;
}

export interface Document {
  id: string;
  fileName?: string;
  mime?: string;
  fileSize?: number;
  sha256checksum?: string;
  s3key?: string;
  owner?: User;
  ownerId?: string;
  embeddingsModelId?: string;
  summaryModelId?: string;
  summary?: string;
  pagesCount?: number;
  status?: DocumentStatus;
  statusInfo?: string;
  statusProgress?: number;
  createdAt?: Date;
  updatedAt?: Date;
  downloadUrl?: string;
}

export interface DocumentStatusMessage {
  documentId: string;
  status?: DocumentStatus;
  statusInfo?: string;
  statusProgress?: number;
  summary?: string;
  updatedAt?: Date;
}

export interface UploadDocumentsResponse {
  documents?: Document[];
}

export interface ChatDocument {
  chat: Chat;
  document: Document;
}
