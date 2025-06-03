import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  JoinColumn,
  OneToMany,
} from "typeorm";
import { Field, ID, ObjectType } from "type-graphql";
import { User } from "./User";
import { Message } from "./Message";
import { JSONTransformer } from "@/utils/db";

@ObjectType()
@Entity("chats")
export class Chat {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Column()
  title: string;

  @Field()
  @Column({ default: "" })
  description: string;

  @Field(() => User, { nullable: true })
  @ManyToOne(() => User)
  user: User;

  @Field(() => [Message], { nullable: true })
  @OneToMany(() => Message, m => m.chat, { cascade: true, onDelete: "CASCADE" })
  messages: Message[];

  @Column({ type: "json", nullable: true, transformer: JSONTransformer<string[]>() })
  files?: string[];

  @Field({ nullable: true })
  @Column({
    nullable: true,
    select: false,
    name: "lastBotMessage",
  })
  lastBotMessage?: string;

  @Field({ nullable: true })
  @Column({
    nullable: true,
    select: false,
    name: "lastBotMessageId",
  })
  lastBotMessageId?: string;

  @Field({ defaultValue: 0 })
  @Column({
    nullable: true,
    select: false,
    name: "messagesCount",
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

  @Field()
  @Column({ default: false })
  isPristine: boolean;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
