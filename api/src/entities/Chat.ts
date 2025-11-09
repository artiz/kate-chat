import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  OneToMany,
} from "typeorm";
import { Field, ID, ObjectType } from "type-graphql";
import { User } from "./User";
import { Message } from "./Message";
import { JSONTransformer } from "../utils/db";
import { ChatDocument } from "./ChatDocument";
import { ChatTool } from "../types/ai.types";

const JSON_COLUMN_TYPE = process.env.DB_TYPE == "mssql" ? "ntext" : "json";

@ObjectType()
@Entity("chats")
export class Chat {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Column()
  title: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  description?: string;

  @Field(() => User, { nullable: true })
  @ManyToOne(() => User)
  user?: User;

  @Field({ nullable: true })
  @Column({ nullable: true })
  userId?: string;

  @Field(() => [ChatDocument], { nullable: true })
  @OneToMany(() => ChatDocument, doc => doc.chat)
  chatDocuments: ChatDocument[];

  @Field(() => [Message], { nullable: true })
  @OneToMany(() => Message, m => m.chat, { cascade: true, onDelete: "CASCADE" })
  messages: Message[];

  @Column({ type: JSON_COLUMN_TYPE, nullable: true, transformer: JSONTransformer<string[]>() })
  files?: string[];

  @Field({ nullable: true })
  @Column({
    nullable: true,
    select: false,
    name: "lastBotMessage",
    insert: false,
  })
  lastBotMessage?: string;

  @Field({ nullable: true })
  @Column({
    nullable: true,
    select: false,
    name: "lastBotMessageId",
    insert: false,
  })
  lastBotMessageId?: string;

  @Field({ nullable: true, defaultValue: 0 })
  @Column({
    nullable: true,
    select: false,
    name: "messagesCount",
    insert: false,
  })
  messagesCount?: number;

  @Field({ nullable: true })
  @Column({ nullable: true })
  modelId: string; // Initial model ID used for this chat

  @Field({ nullable: true })
  @Column({ nullable: true, type: "float" })
  temperature?: number;

  @Field({ nullable: true })
  @Column({ nullable: true, type: "int" })
  maxTokens?: number;

  @Field({ nullable: true })
  @Column({ nullable: true, type: "float" })
  topP?: number;

  @Field({ nullable: true })
  @Column({ nullable: true, type: "int" })
  imagesCount?: number;

  @Field({ nullable: true })
  @Column({ nullable: true })
  systemPrompt?: string;

  @Field()
  @Column({ default: false })
  isPristine: boolean;

  @Field()
  @Column({ default: false })
  isPinned: boolean;

  @Field(() => [ChatTool], { nullable: true })
  @Column({ type: JSON_COLUMN_TYPE, nullable: true, transformer: JSONTransformer<ChatTool[]>(), default: null })
  tools?: ChatTool[];

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
