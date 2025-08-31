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
import { Chat } from "./Chat";
import { User } from "./User";
import { MessageRole, ModelMessageContent, ModelResponse, ModelResponseMetadata } from "../types/ai.types";
import { JSONTransformer } from "../utils/db";

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

  @Column({ type: "json", nullable: true, transformer: JSONTransformer<ModelResponseMetadata>(), default: null })
  @Field(() => ModelResponseMetadata, { nullable: true })
  metadata?: ModelResponseMetadata;

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

  @Field({ nullable: true })
  @Column({ nullable: true })
  userId?: string;

  @Field(() => Message)
  @ManyToOne(() => Message, { onDelete: "CASCADE", lazy: true })
  linkedToMessage?: Message;

  @Field({ nullable: true })
  @Column({ nullable: true })
  linkedToMessageId?: string; // Links this message to a parent message for parallel model calls

  @Field(() => [Message], { nullable: true })
  linkedMessages?: Message[]; // Virtual field for GraphQL, populated in resolvers

  @Field({ nullable: true })
  @CreateDateColumn()
  createdAt: Date;

  @Field({ nullable: true })
  @UpdateDateColumn()
  updatedAt: Date;
}
