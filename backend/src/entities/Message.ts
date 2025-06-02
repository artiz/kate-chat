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
import { ModelMessageContent } from "@/types/ai.types";
import { JSONTransformer } from "@/utils/db";

export enum MessageRole {
  USER = "user",
  ASSISTANT = "assistant",
  ERROR = "error",
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

  @Column({ type: "json", nullable: true, transformer: JSONTransformer<ModelMessageContent[]>() })
  jsonContent?: ModelMessageContent[];

  @Field()
  @Column()
  modelId: string; // The ID of the model used for this message

  @Field({ nullable: true })
  @Column({ nullable: true })
  modelName: string; // The name of the model used for this message

  @Field(() => Chat)
  @ManyToOne(() => Chat, { onDelete: "CASCADE" })
  chat?: Chat;

  @Field({ nullable: true })
  @Column({ nullable: true })
  chatId?: string;

  @Field(() => User, { nullable: true })
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  user?: User;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
