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
  name: string;

  @Field()
  isConnected: boolean;

  @Field(() => [ProviderDetail])
  details: ProviderDetail[];
}

@ObjectType()
export class GqlModel extends Model {
  @Field()
  isDefault?: boolean;
}

@ObjectType()
export class GqlModelsList {
  @Field({ nullable: true })
  error?: string;

  @Field(() => [GqlModel], { nullable: true })
  models?: GqlModel[];

  @Field(() => [GqlProviderInfo], { nullable: true })
  providers?: GqlProviderInfo[];

  @Field({ nullable: true })
  total?: number;
}
