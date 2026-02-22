import { InputType, Field } from "type-graphql";
import { UserSettings, AuthProvider, MCPAuthConfig } from "@/entities";
import { IsOptional, Validate } from "class-validator";
import { IsPublicUrl } from "@/utils/validators";
import { ApiProvider, MCPAuthType, ToolType } from "../api";
import { ChatSettings } from "@/entities/Chat";

@InputType()
export class UpdateUserInput {
  @Field({ nullable: true })
  firstName?: string;

  @Field({ nullable: true })
  lastName?: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  avatarUrl?: string;

  @Field({ nullable: true })
  defaultModelId?: string;

  @Field({ nullable: true })
  documentsEmbeddingsModelId?: string;

  @Field({ nullable: true })
  documentSummarizationModelId?: string;

  @Field({ nullable: true })
  defaultSystemPrompt?: string;

  @Field({ nullable: true })
  defaultTemperature?: number;

  @Field({ nullable: true })
  defaultMaxTokens?: number;

  @Field({ nullable: true })
  defaultTopP?: number;

  @Field({ nullable: true })
  defaultImagesCount?: number;

  @Field(() => UserSettings, { nullable: true })
  settings?: UserSettings;
}

@InputType()
export class RegisterInput {
  @Field()
  email: string;

  @Field()
  password: string;

  @Field()
  firstName: string;

  @Field()
  lastName: string;

  @Field({ nullable: true })
  avatarUrl?: string;

  @Field({ nullable: true })
  recaptchaToken?: string;

  @Field(() => String, { nullable: true })
  authProvider?: AuthProvider;
}

@InputType()
export class LoginInput {
  @Field()
  email: string;

  @Field()
  password: string;
}

@InputType()
export class ChangePasswordInput {
  @Field()
  currentPassword: string;

  @Field()
  newPassword: string;
}

@InputType()
export class CreateChatInput {
  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  modelId?: string;

  @Field({ nullable: true })
  systemPrompt?: string;
}

@InputType()
export class ChatToolOptionsInput {
  @Field()
  name: string;

  @Field()
  value: string;
}

@InputType()
export class ChatToolInput {
  @Field(() => ToolType)
  type: ToolType;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  id?: string;

  @Field(() => [ChatToolOptionsInput], { nullable: true })
  options?: ChatToolOptionsInput[];
}

@InputType()
export class UpdateChatInput {
  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  modelId?: string;

  @Field(() => ChatSettings, { nullable: true })
  settings?: ChatSettings;

  @Field(() => [ChatToolInput!], { nullable: true })
  tools?: ChatToolInput[];

  @Field({ nullable: true })
  isPinned?: boolean;

  @Field({ nullable: true })
  folderId?: string;
}

@InputType()
export class ImageInput {
  @Field()
  fileName: string;

  @Field()
  mimeType: string;

  @Field()
  bytesBase64: string;
}

@InputType()
export class MCPAuthTokenInput {
  @Field()
  serverId: string;

  @Field()
  accessToken: string;

  @Field({ nullable: true })
  refreshToken?: string;

  @Field({ nullable: true })
  expiresAt?: number;
}

@InputType()
export class CreateMessageInput {
  @Field()
  chatId: string;

  @Field()
  content: string;

  @Field(() => [ImageInput], { nullable: true })
  images?: ImageInput[];

  @Field(() => [String], { nullable: true })
  documentIds?: string[];

  @Field(() => [MCPAuthTokenInput], { nullable: true })
  mcpTokens?: MCPAuthTokenInput[];
}

@InputType()
export class MessageContext {
  @Field(() => [MCPAuthTokenInput], { nullable: true })
  mcpTokens?: MCPAuthTokenInput[];
}

@InputType()
export class GetMessagesInput {
  @Field()
  chatId: string;

  @Field({ nullable: true, defaultValue: 0 })
  offset?: number;

  @Field({ nullable: true, defaultValue: 20 })
  limit?: number;
}

@InputType()
export class GetChatsInput {
  @Field({ nullable: true, defaultValue: 0 })
  from?: number;

  @Field({ nullable: true, defaultValue: 20 })
  limit?: number;

  @Field({ nullable: true })
  searchTerm?: string;

  @Field({ nullable: true })
  pinned?: boolean;

  @Field({ nullable: true })
  folderId?: string;
}

@InputType()
export class GetModelsInput {
  @Field({ nullable: true })
  providerId?: string;

  @Field({ nullable: true, defaultValue: true })
  onlyActive?: boolean;
}

@InputType()
export class UpdateModelStatusInput {
  @Field()
  modelId: string;

  @Field()
  isActive: boolean;
}

@InputType()
export class TestModelInput {
  @Field()
  id: string;

  @Field({ defaultValue: "2+2=" })
  text: string;
}

@InputType()
export class GetCostsInput {
  @Field(() => ApiProvider)
  apiProvider: ApiProvider;

  @Field()
  startTime: number;

  @Field({ nullable: true })
  endTime?: number;
}

@InputType()
export class CreateCustomModelInput {
  @Field()
  name: string;

  @Field()
  modelId: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  endpoint: string;

  @Field()
  apiKey: string;

  @Field()
  modelName: string;

  @Field()
  protocol: string;

  @Field({ nullable: true })
  streaming?: boolean;

  @Field({ nullable: true })
  imageInput?: boolean;

  @Field({ nullable: true })
  maxInputTokens?: number;
}

@InputType()
export class DeleteModelInput {
  @Field()
  modelId: string;
}

@InputType()
export class GetImagesInput {
  @Field({ nullable: true, defaultValue: 0 })
  offset?: number;

  @Field({ nullable: true, defaultValue: 20 })
  limit?: number;
}

@InputType()
export class GetUsersInput {
  @Field({ nullable: true, defaultValue: 0 })
  offset?: number;

  @Field({ nullable: true, defaultValue: 20 })
  limit?: number;

  @Field({ nullable: true })
  searchTerm?: string;
}

@InputType()
export class GetDocumentsInput {
  @Field({ nullable: true, defaultValue: 0 })
  offset?: number;

  @Field({ nullable: true, defaultValue: 20 })
  limit?: number;

  @Field({ nullable: true })
  searchTerm?: string;
}

@InputType()
export class StopMessageGenerationInput {
  @Field()
  requestId: string;

  @Field()
  messageId: string;
}

@InputType()
export class UpdateCustomModelInput {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  modelId: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  endpoint: string;

  @Field({ nullable: true })
  apiKey?: string;

  @Field()
  modelName: string;

  @Field()
  protocol: string;

  @Field({ nullable: true })
  streaming?: boolean;

  @Field({ nullable: true })
  imageInput?: boolean;

  @Field({ nullable: true })
  maxInputTokens?: number;
}

@InputType()
export class TestCustomModelInput {
  @Field()
  @IsOptional()
  @Validate(IsPublicUrl)
  endpoint: string;

  @Field({ nullable: true })
  apiKey?: string;

  @Field({ nullable: true })
  modelId?: string;

  @Field()
  modelName: string;

  @Field()
  protocol: string;

  @Field()
  text: string;
}

// MCP Server Inputs
@InputType()
export class CreateMCPServerInput {
  @Field()
  name: string;

  @Field()
  @Validate(IsPublicUrl)
  url: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  transportType?: string;

  @Field({ nullable: true })
  authType?: MCPAuthType;

  @Field(() => MCPAuthConfig, { nullable: true })
  authConfig?: MCPAuthConfig;
}

@InputType()
export class UpdateMCPServerInput {
  @Field()
  id: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  @Validate(IsPublicUrl, { message: "Invalid URL format" })
  url?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  transportType?: string;

  @Field({ nullable: true })
  authType?: MCPAuthType;

  @Field(() => MCPAuthConfig, { nullable: true })
  authConfig?: MCPAuthConfig;

  @Field({ nullable: true })
  isActive?: boolean;
}

@InputType()
export class DeleteMCPServerInput {
  @Field()
  id: string;
}

@InputType()
export class TestMCPToolInput {
  @Field()
  serverId: string;

  @Field(() => String, { nullable: true })
  authToken?: string;

  @Field()
  toolName: string;

  @Field({ nullable: true })
  argsJson?: string; // JSON string of tool arguments
}

// Chat Folder Inputs
@InputType()
export class CreateFolderInput {
  @Field()
  name: string;

  @Field({ nullable: true })
  color?: string;

  @Field({ nullable: true })
  parentId?: string;
}

@InputType()
export class UpdateFolderInput {
  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  color?: string;
}

@InputType()
export class GetFolderContentsInput {
  @Field()
  folderId: string;

  @Field({ nullable: true, defaultValue: 0 })
  from?: number;

  @Field({ nullable: true, defaultValue: 25 })
  limit?: number;
}
