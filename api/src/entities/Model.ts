import {
  Entity,
  ObjectIdColumn,
  ObjectId,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  ManyToOne,
} from "typeorm";
import { Field, ID, ObjectType } from "type-graphql";
import { ApiProvider } from "../types/ai.types";
import { User } from "./User";

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

  @Field()
  @Column()
  description: string;

  @Field(() => User)
  @ManyToOne(() => User)
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
  @Column({ default: false })
  supportsStreaming: boolean;

  @Field()
  @Column({ default: true })
  supportsTextIn: boolean;

  @Field()
  @Column({ default: true })
  supportsTextOut: boolean;

  @Field()
  @Column({ default: false })
  supportsEmbeddingsIn: boolean;

  @Field()
  @Column({ default: false })
  supportsImageIn: boolean;

  @Field()
  @Column({ default: false })
  supportsImageOut: boolean;

  @Field()
  @Column({ default: false })
  supportsEmbeddingsOut: boolean;

  @Field()
  @Column({ default: true })
  isActive: boolean;

  @Field()
  @Column({ default: false })
  isCustom: boolean;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
