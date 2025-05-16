import { InputType, Field } from 'type-graphql';
import { MessageRole } from '../../entities/Message';

@InputType()
export class CreateChatInput {
  @Field()
  title: string;

  @Field({ nullable: true })
  description?: string;
}

@InputType()
export class UpdateChatInput {
  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  isActive?: boolean;
}

@InputType()
export class CreateMessageInput {
  @Field()
  chatId: string;

  @Field()
  content: string;

  @Field()
  modelId: string;

  @Field(() => String, { defaultValue: MessageRole.USER })
  role: MessageRole;
}

@InputType()
export class GetMessagesInput {
  @Field()
  chatId: string;

  @Field({ nullable: true, defaultValue: 0 })
  skip?: number;

  @Field({ nullable: true, defaultValue: 20 })
  take?: number;
}

@InputType()
export class GetChatsInput {
  @Field({ nullable: true, defaultValue: 0 })
  skip?: number;

  @Field({ nullable: true, defaultValue: 20 })
  take?: number;

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
