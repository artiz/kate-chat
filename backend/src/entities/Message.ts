import {
  Entity,
  ObjectIdColumn,
  ObjectId,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Field, ID, ObjectType } from "type-graphql";
import { Chat } from "./Chat";
import { User } from "./User";

export enum MessageRole {
  USER = "user",
  ASSISTANT = "assistant",
  SYSTEM = "system",
}

export enum MessageType {
  MESSAGE = "message",
  SYSTEM = "system",
}

@ObjectType()
@Entity("messages")
export class Message {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Column({
    type: "varchar",
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

  @Field({ nullable: true })
  @Column({ nullable: true })
  modelName: string; // The name of the model used for this message

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
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
