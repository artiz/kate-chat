import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Index,
  OneToMany,
} from "typeorm";
import { Field, ID, ObjectType } from "type-graphql";
import { Chat } from "./Chat";
import { ChatFile } from "./ChatFile";
import { User } from "./User";
import { MessageRole, ModelMessageContent, MessageMetadata, ResponseStatus } from "../types/ai.types";
import { JSONTransformer } from "../utils/db";

const JSON_COLUMN_TYPE = process.env.DB_TYPE == "mssql" ? "ntext" : "json";

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
  @Column({ type: "text" })
  content: string;

  @Column({ type: JSON_COLUMN_TYPE, nullable: true, transformer: JSONTransformer<ModelMessageContent[]>() })
  jsonContent?: ModelMessageContent[];

  @Column({ type: JSON_COLUMN_TYPE, nullable: true, transformer: JSONTransformer<MessageMetadata>(), default: null })
  @Field(() => MessageMetadata, { nullable: true })
  metadata?: MessageMetadata;

  @Field({ nullable: true })
  @Column({ nullable: true })
  modelId?: string; // The ID of the model used for this message

  @Field({ nullable: true })
  @Column({ nullable: true })
  modelName?: string; // The name of the model used for this message

  @Field(() => Chat)
  @ManyToOne(() => Chat, { onDelete: "CASCADE" })
  chat?: Chat;

  @Field({ nullable: true })
  @Column({ nullable: true })
  chatId?: string;

  @Field(() => [ChatFile], { nullable: true })
  @OneToMany(() => ChatFile, file => file.message)
  files?: ChatFile[];

  @Field(() => User, { nullable: true })
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  user?: User;

  @Field({ nullable: true })
  @Column({ nullable: true })
  userId?: string;

  @Field(() => Message)
  @ManyToOne(() => Message, { onDelete: process.env.DB_TYPE == "mssql" ? undefined : "CASCADE", lazy: true })
  linkedToMessage?: Message;

  @Field({ nullable: true })
  @Column({ nullable: true })
  @Index()
  linkedToMessageId?: string; // Links this message to a parent message for parallel model calls

  @Field(() => [Message], { nullable: true })
  linkedMessages?: Message[]; // Virtual field for GraphQL, populated in resolvers

  @Field({ nullable: true })
  @Column({ nullable: true })
  status?: ResponseStatus;

  @Field({ nullable: true })
  @Column({ nullable: true })
  statusInfo?: string;

  @Field({ nullable: true })
  @CreateDateColumn()
  createdAt?: Date;

  @Field({ nullable: true })
  @UpdateDateColumn()
  updatedAt?: Date;
}
