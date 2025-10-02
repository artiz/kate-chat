import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn, ManyToOne } from "typeorm";
import { Field, ID, ObjectType } from "type-graphql";
import { ApiProvider, ModelType, ToolType } from "../types/ai.types";
import { User } from "./User";
import { JSONTransformer } from "../utils/db";

const JSON_COLUMN_TYPE = process.env.DB_TYPE == "mssql" ? "ntext" : "json";

@ObjectType()
@Entity("models")
export class Model {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Column()
  name: string; // e.g., 'GPT-4', 'Claude-3', 'Llama-3'

  @Field()
  @Column()
  modelId: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  description?: string;

  @Field(() => User, { nullable: true })
  @ManyToOne(() => User, { nullable: true })
  user: User;

  @Field({ nullable: true })
  @Column({ nullable: true })
  userId?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  provider: string; // e.g., 'OpenAI', 'Anthropic', 'Amazon'

  @Field()
  @Column({ default: ApiProvider.AWS_BEDROCK })
  apiProvider: ApiProvider;

  @Field()
  @Column({ default: ModelType.CHAT })
  type: ModelType;

  @Field()
  @Column({ default: false })
  streaming: boolean;

  @Field()
  @Column({ default: false })
  imageInput: boolean;

  @Field()
  @Column({ default: true })
  isActive: boolean;

  @Field()
  @Column({ default: false })
  isCustom: boolean;

  @Field({ nullable: true })
  @Column({ nullable: true })
  maxInputTokens?: number;

  @Field(() => [String], { nullable: true })
  @Column({ type: JSON_COLUMN_TYPE, nullable: true, transformer: JSONTransformer<ToolType[]>(), default: null })
  tools?: ToolType[];

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
