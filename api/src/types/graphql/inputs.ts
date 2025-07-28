import { InputType, Field } from "type-graphql";
import { ApiProvider, AuthProvider, MessageRole } from "../ai.types";
import { UserSettings } from "@/entities";

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
  defaultSystemPrompt?: string;

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
  @Field()
  title: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  modelId?: string;

  @Field({ nullable: true })
  systemPrompt?: string;
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

  @Field({ nullable: true })
  modelId: string;

  @Field({ nullable: true })
  temperature?: number;

  @Field({ nullable: true })
  maxTokens?: number;

  @Field({ nullable: true })
  topP?: number;
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
  @Field()
  apiProvider: ApiProvider;

  @Field()
  startTime: number;

  @Field({ nullable: true })
  endTime?: number;
}

@InputType()
export class SwitchModelInput {
  @Field()
  messageId: string;

  @Field()
  modelId: string;
}

@InputType()
export class CallOtherInput {
  @Field()
  messageId: string;

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
