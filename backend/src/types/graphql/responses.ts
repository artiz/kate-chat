import { ObjectType, Field } from 'type-graphql';
import { User } from '../../entities/User';
import { Chat } from '../../entities/Chat';
import { Message } from '../../entities/Message';
import { Model } from '../../entities/Model';
import { ModelProvider } from '../../entities/ModelProvider';

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
export class ChatResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => Chat, { nullable: true })
  chat?: Chat;
}

@ObjectType()
export class ChatsResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => [Chat], { nullable: true })
  chats?: Chat[];

  @Field({ nullable: true })
  total?: number;
}

@ObjectType()
export class MessageResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => Message, { nullable: true })
  message?: Message;
}

@ObjectType()
export class MessagesResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => [Message], { nullable: true })
  messages?: Message[];

  @Field({ nullable: true })
  total?: number;
}

@ObjectType()
export class ModelsResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => [Model], { nullable: true })
  models?: Model[];

  @Field({ nullable: true })
  total?: number;
}

@ObjectType()
export class ModelProvidersResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => [ModelProvider], { nullable: true })
  providers?: ModelProvider[];

  @Field({ nullable: true })
  total?: number;
}
