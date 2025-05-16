import { Entity, ObjectIdColumn, ObjectId, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Field, ID, ObjectType } from "type-graphql";

@ObjectType()
@Entity("model_providers")
export class ModelProvider {
  @Field(() => ID)
  @ObjectIdColumn()
  id: ObjectId;

  @Field()
  @Column()
  name: string; // e.g., 'OpenAI', 'Anthropic', 'Amazon'

  @Field()
  @Column()
  description: string;

  @Field()
  @Column()
  apiType: string; // e.g., 'bedrock', 'direct'

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
