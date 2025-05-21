import { ObjectType, Field } from "type-graphql";
import { User } from "../../entities/User";
import { Chat } from "../../entities/Chat";
import { Message, MessageType } from "../../entities/Message";
import { Model } from "../../entities/Model";

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

  @Field()
  hasMore: boolean;
}

@ObjectType()
export class MessageResponse {
  @Field()
  type: MessageType;

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

  @Field()
  hasMore?: boolean;
}

@ObjectType()
export class ModelResponse extends Model {
  @Field()
  isDefault?: boolean;
}

@ObjectType()
export class ModelsResponse {
  @Field({ nullable: true })
  error?: string;

  @Field(() => [ModelResponse], { nullable: true })
  models?: ModelResponse[];

  @Field({ nullable: true })
  total?: number;
}
