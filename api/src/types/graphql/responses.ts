import { ObjectType, Field, ID } from "type-graphql";
import { User, Chat, Message, Model, Document, MCPServer } from "../../entities";
import { DocumentStatus, MessageRole, MessageType } from "../../types/ai.types";
import { ApiProvider } from "@/config/ai/common";

@ObjectType()
export class UserResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => User, { nullable: true })
  user?: User;

  @Field({ nullable: true })
  token?: string;
}

@ObjectType()
export class AuthResponse {
  @Field()
  token: string;

  @Field(() => User)
  user: User;
}

@ObjectType()
export class GqlChat {
  @Field({ nullable: true })
  error?: string;

  @Field(() => Chat, { nullable: true })
  chat?: Chat;
}

@ObjectType()
export class GqlChatsList {
  @Field({ nullable: true })
  error?: string;

  @Field(() => [Chat], { nullable: true })
  chats?: Chat[];

  @Field({ nullable: true })
  total?: number;

  @Field({ nullable: true })
  next?: number;
}

@ObjectType()
export class MessageChatInfo {
  @Field({ nullable: true })
  title?: string;

  @Field()
  modelId: string;

  @Field({ nullable: true })
  temperature?: number;

  @Field({ nullable: true })
  maxTokens?: number;

  @Field({ nullable: true })
  topP?: number;

  @Field({ nullable: true })
  imagesCount?: number;

  @Field()
  isPristine: boolean;
}

@ObjectType()
export class GqlMessage {
  @Field()
  type: MessageType;

  @Field({ nullable: true })
  error?: string;

  @Field(() => Message, { nullable: true })
  message?: Message;

  @Field({ nullable: true })
  streaming?: boolean;

  @Field({ nullable: true })
  chat?: MessageChatInfo;
}

@ObjectType()
export class GqlMessagesList {
  @Field({ nullable: true })
  error?: string;

  @Field(() => [Message], { nullable: true })
  messages?: Message[];

  @Field({ nullable: true })
  total?: number;

  @Field({ nullable: true })
  hasMore?: boolean;

  @Field(() => Chat, { nullable: true })
  chat?: Chat;
}

@ObjectType()
export class ProviderDetail {
  @Field()
  key: string;

  @Field()
  value: string;
}

@ObjectType()
export class GqlProviderInfo {
  @Field(() => ApiProvider)
  id: ApiProvider;

  @Field()
  name: string;

  @Field()
  isConnected: boolean;

  @Field()
  costsInfoAvailable: boolean;

  @Field(() => [ProviderDetail])
  details: ProviderDetail[];
}

@ObjectType()
export class GqlModelsList {
  @Field({ nullable: true })
  error?: string;

  @Field(() => [Model], { nullable: true })
  models?: Model[];

  @Field(() => [GqlProviderInfo], { nullable: true })
  providers?: GqlProviderInfo[];

  @Field({ nullable: true })
  total?: number;
}

@ObjectType()
export class GqlAmount {
  @Field()
  amount: number;

  @Field()
  currency: string;
}

@ObjectType()
export class GqlServiceCostInfo {
  @Field()
  name: string;

  @Field()
  type: string;

  @Field(() => [GqlAmount])
  amounts: GqlAmount[];
}

@ObjectType()
export class GqlCostsInfo {
  @Field()
  start: Date;

  @Field({ nullable: true })
  end?: Date;

  @Field({ nullable: true })
  error?: string;

  @Field(() => [GqlServiceCostInfo])
  costs: GqlServiceCostInfo[];
}

@ObjectType()
export class ApplicationConfig {
  @Field({ nullable: true })
  currentUser?: User;

  @Field({ nullable: true })
  token?: string;

  @Field()
  demoMode: boolean;

  @Field({ nullable: true })
  s3Connected: boolean;

  @Field({ nullable: true })
  ragSupported: boolean;

  @Field({ nullable: true })
  ragEnabled: boolean;

  @Field({ nullable: true })
  maxChats?: number;

  @Field({ nullable: true })
  maxChatMessages?: number;

  @Field({ nullable: true })
  maxImages?: number;
}

@ObjectType()
export class SwitchModelResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => Message, { nullable: true })
  message?: Message;
}

@ObjectType()
export class EditMessageResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => Message, { nullable: true })
  message?: Message;
}

@ObjectType()
export class DeleteMessageResult {
  @Field()
  id: string;

  @Field({ nullable: true })
  linkedToMessageId?: string;
}

@ObjectType()
export class DeleteMessageResponse {
  @Field(() => [DeleteMessageResult])
  messages: DeleteMessageResult[];
}

@ObjectType()
export class CallOtherResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => Message, { nullable: true })
  message?: Message;
}

@ObjectType()
export class StopMessageGenerationResponse {
  @Field({ nullable: true })
  error?: string;

  @Field({ nullable: true })
  requestId?: string;

  @Field({ nullable: true })
  messageId?: string;
}

@ObjectType()
export class GqlImage {
  @Field(() => ID)
  id: string;

  @Field()
  fileName: string;

  @Field()
  fileUrl: string;

  @Field()
  mime: string;

  @Field({ nullable: true })
  predominantColor?: string;

  @Field()
  createdAt: Date;

  @Field()
  role: MessageRole;

  @Field(() => Message, { nullable: true })
  message?: Message;

  @Field(() => Chat)
  chat: Chat;
}

@ObjectType()
export class GqlImagesList {
  @Field({ nullable: true })
  error?: string;

  @Field(() => [GqlImage], { nullable: true })
  images?: GqlImage[];

  @Field({ nullable: true })
  nextPage?: number;
}

@ObjectType()
export class AdminStatsResponse {
  @Field()
  usersCount: number;

  @Field()
  chatsCount: number;

  @Field()
  modelsCount: number;
}

@ObjectType()
export class AdminUsersResponse {
  @Field(() => [User])
  users: User[];

  @Field()
  total: number;

  @Field()
  hasMore: boolean;
}

@ObjectType()
export class UploadDocumentsResponse {
  @Field(() => [Document], { nullable: true })
  documents?: Document[];
}

@ObjectType()
export class DocumentStatusMessage {
  @Field(() => ID)
  documentId: string;

  @Field()
  status: DocumentStatus;

  @Field({ nullable: true })
  statusInfo?: string;

  @Field({ nullable: true })
  statusProgress?: number;

  @Field({ nullable: true })
  summary?: string;

  @Field({ nullable: true })
  updatedAt?: Date;

  @Field({ nullable: true })
  sync?: boolean;
}

@ObjectType()
export class AddDocumentsToChatResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => Chat, { nullable: true })
  chat?: Chat;
}

@ObjectType()
export class RemoveDocumentsFromChatResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => Chat, { nullable: true })
  chat?: Chat;
}

@ObjectType()
export class DocumentsResponse {
  @Field(() => [Document])
  documents: Document[];

  @Field()
  total: number;

  @Field()
  hasMore: boolean;
}

// MCP Server Responses
@ObjectType()
export class MCPServerResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => MCPServer, { nullable: true })
  server?: MCPServer;
}

@ObjectType()
export class MCPServersListResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => [MCPServer], { nullable: true })
  servers?: MCPServer[];

  @Field({ nullable: true })
  total?: number;
}

@ObjectType()
export class MCPToolInfoResponse {
  @Field()
  name: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  inputSchema?: string;
}

@ObjectType()
export class MCPToolsListResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => [MCPToolInfoResponse], { nullable: true })
  tools?: MCPToolInfoResponse[];
}

@ObjectType()
export class MCPToolTestResponse {
  @Field({ nullable: true })
  error?: string;

  @Field({ nullable: true })
  result?: string;
}
