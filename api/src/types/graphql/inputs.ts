import { InputType, Field } from "type-graphql";
import { ToolType } from "../ai.types";
import { UserSettings, AuthProvider } from "@/entities";
import { ApiProvider } from "@/config/ai/common";

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

  @Field({ nullable: true })
  temperature?: number;

  @Field({ nullable: true })
  maxTokens?: number;

  @Field({ nullable: true })
  topP?: number;

  @Field({ nullable: true })
  imagesCount?: number;

  @Field({ nullable: true })
  systemPrompt?: string;

  @Field(() => [ChatToolInput!], { nullable: true })
  tools?: ChatToolInput[];
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
export class CreateMessageInput {
  @Field()
  chatId: string;

  @Field()
  content: string;

  @Field(() => [ImageInput], { nullable: true })
  images?: ImageInput[];

  @Field(() => [String], { nullable: true })
  documentIds?: string[];
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
  offset?: number;

  @Field({ nullable: true, defaultValue: 20 })
  limit?: number;

  @Field({ nullable: true })
  searchTerm?: string;
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
