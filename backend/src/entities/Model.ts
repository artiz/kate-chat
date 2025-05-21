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
import { ModelProvider } from "./ModelProvider";

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
  modelId: string; // The actual model ID to use in API calls

  @Field()
  @Column()
  description: string;

  @Field(() => ModelProvider)
  @ManyToOne(() => ModelProvider)
  provider: ModelProvider;

  @Field()
  @Column()
  providerId: string;

  @Field()
  @Column({ default: 0 })
  contextWindow: number;

  @Field({ nullable: true })
  @Column({ default: 0, nullable: true })
  maxTokens: number;

  @Field()
  @Column({ default: true })
  isActive: boolean;

  @Field()
  @Column({ default: 0 })
  sortOrder: number;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
