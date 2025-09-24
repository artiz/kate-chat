import { ObjectType, Field, ID } from "type-graphql";
import { User, Chat, Message, Model, Document } from "../../entities";
import { DocumentStatus, MessageRole, MessageType } from "../../types/ai.types";

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

  @Field()
  hasMore: boolean;
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
}

@ObjectType()
export class GqlMessagesList {
  @Field({ nullable: true })
  error?: string;

  @Field(() => [Message], { nullable: true })
  messages?: Message[];

  @Field({ nullable: true })
  total?: number;

  @Field()
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
  @Field()
  id: string;

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
export class GqlImage {
  @Field(() => ID)
  id: string;

  @Field()
  fileName: string;

  @Field()
  fileUrl: string;

  @Field()
  mimeType: string;

  @Field()
  createdAt: Date;

  @Field()
  role: MessageRole;

  @Field(() => Message)
  message: Message;

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
  total?: number;

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
