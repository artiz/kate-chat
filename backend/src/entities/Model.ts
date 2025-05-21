import {
  Entity,
  ObjectIdColumn,
  ObjectId,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Field, ID, ObjectType } from "type-graphql";

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
  modelArn?: string;

  @Field()
  @Column()
  description: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  provider: string; // e.g., 'OpenAI', 'Anthropic', 'Amazon'

  @Field()
  @Column({ default: "bedrock" })
  apiType: string; // e.g., 'bedrock', 'direct'

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
  @Column({ default: 0 })
  sortOrder: number;

  @Field()
  @Column({ default: true })
  isActive: boolean;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
