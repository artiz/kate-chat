import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  OneToMany,
} from "typeorm";
import { Field, ID, InputType, ObjectType } from "type-graphql";
import { User } from "./User";
import { Message } from "./Message";
import { JSONTransformer } from "../utils/db";
import { ChatDocument } from "./ChatDocument";
import { ChatFile } from "./ChatFile";
import { ChatFolder } from "./ChatFolder";
import { ChatTool } from "../types/ai.types";
import { DB_TYPE } from "../config/env";
import { ImageQuality, ImageOrientation } from "@/types/api";

const JSON_COLUMN_TYPE = DB_TYPE == "mssql" ? "ntext" : "json";

@ObjectType("ChatSettings")
@InputType("ChatSettingsInput")
export class ChatSettings {
  @Field({ nullable: true })
  temperature?: number;

  @Field({ nullable: true })
  maxTokens?: number;

  @Field({ nullable: true })
  topP?: number;

  @Field({ nullable: true })
  imagesCount?: number;

  @Field({ nullable: true })
  imageQuality?: ImageQuality;

  @Field({ nullable: true })
  imageOrientation?: ImageOrientation;

  @Field({ nullable: true })
  systemPrompt?: string;

  @Field({ nullable: true })
  thinking?: boolean;

  @Field({ nullable: true })
  thinkingBudget?: number;
}

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

  @Field(() => [ChatFile], { nullable: true })
  @OneToMany(() => ChatFile, file => file.chat, { cascade: true })
  files: ChatFile[];

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

  @Field()
  @Column({ default: false })
  isPristine: boolean;

  @Field()
  @Column({ default: false })
  isPinned: boolean;

  @Field({ nullable: true })
  @Column({ nullable: true })
  folderId?: string;

  @ManyToOne(() => ChatFolder, { nullable: true, onDelete: "SET NULL" })
  folder?: ChatFolder;

  @Field(() => ChatSettings, { nullable: true })
  @Column({ type: JSON_COLUMN_TYPE, nullable: true, transformer: JSONTransformer<ChatSettings>(), default: null })
  settings?: ChatSettings;

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
