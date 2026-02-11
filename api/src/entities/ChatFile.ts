import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Field, ID, ObjectType, registerEnumType } from "type-graphql";
import { Exif } from "exif-reader";
import { Chat } from "./Chat";
import { Message } from "./Message";
import { JSONTransformer } from "../utils/db";
import { globalConfig } from "@/global-config";

const DB_TYPE = globalConfig.values.env.db.type;
const JSON_COLUMN_TYPE = DB_TYPE == "mssql" ? "ntext" : "json";

export enum ChatFileType {
  IMAGE = "image",
  VIDEO = "video",
  RAG_DOCUMENT = "rag_document",
  INLINE_DOCUMENT = "inline_document",
}

registerEnumType(ChatFileType, {
  name: "ChatFileType",
});

@ObjectType()
@Entity("chat_files")
export class ChatFile {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Column()
  chatId: string;

  @Field(() => Chat)
  @ManyToOne(() => Chat, { onDelete: "CASCADE" })
  @JoinColumn({ name: "chatId" })
  chat: Chat;

  @Field({ nullable: true })
  @Column({ nullable: true })
  messageId?: string;

  @Field(() => Message, { nullable: true })
  @ManyToOne(() => Message, { onDelete: "CASCADE" })
  @JoinColumn({ name: "messageId" })
  message?: Message;

  @Field(() => ChatFileType)
  @Column({
    type: "simple-enum",
    enum: ChatFileType,
    default: ChatFileType.IMAGE,
  })
  type: ChatFileType;

  @Field({ nullable: true })
  @Column({ nullable: true })
  fileName?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  mime?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  uploadFile?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  predominantColor?: string;

  @Column({ type: JSON_COLUMN_TYPE, nullable: true, transformer: JSONTransformer<Exif>(), default: null })
  exif?: Exif;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @Field()
  url(): string {
    return `/files/${this.fileName || ""}`;
  }
}
