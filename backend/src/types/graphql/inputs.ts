import { InputType, Field } from "type-graphql";
import { MessageRole } from "../../entities/Message";

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
}

@InputType()
export class LoginInput {
  @Field()
  email: string;

  @Field()
  password: string;
}

@InputType()
export class CreateChatInput {
  @Field()
  title: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  modelId?: string;
}

@InputType()
export class UpdateChatInput {
  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  isActive?: boolean;

  @Field({ nullable: true })
  modelId?: string;
}

@InputType()
export class CreateMessageInput {
  @Field()
  chatId: string;

  @Field()
  content: string;

  @Field({ nullable: true })
  modelId: string;

  @Field(() => String, { defaultValue: MessageRole.USER })
  role: MessageRole;
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
  modelId: string;

  @Field({ defaultValue: "2+2=" })
  text: string;
}

@InputType()
export class GetCostsInput {
  @Field()
  providerId: string;

  @Field()
  startTime: number;

  @Field({ nullable: true })
  endTime?: number;
}
