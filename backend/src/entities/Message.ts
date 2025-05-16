import { Entity, ObjectIdColumn, ObjectId, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from "typeorm";
import { Field, ID, ObjectType } from "type-graphql";
import { Chat } from "./Chat";
import { User } from "./User";

export enum MessageRole {
  USER = "user",
  ASSISTANT = "assistant",
  SYSTEM = "system",
}

@ObjectType()
@Entity("messages")
export class Message {
  @Field(() => ID)
  @ObjectIdColumn()
  id: ObjectId;

  @Field()
  @Column({
    type: "enum",
    enum: MessageRole,
    default: MessageRole.USER,
  })
  role: MessageRole;

  @Field()
  @Column()
  content: string;

  @Field()
  @Column()
  modelId: string; // The ID of the model used for this message

  @Field(() => Chat)
  @ManyToOne(() => Chat)
  chat: Chat;

  @Field()
  @Column()
  chatId: string;

  @Field(() => User)
  @ManyToOne(() => User)
  user: User;

  @Field()
  @Column()
  userId: string;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
