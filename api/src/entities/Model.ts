import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn, ManyToOne } from "typeorm";
import { Field, ID, ObjectType, registerEnumType, InputType } from "type-graphql";
import { ModelFeature, ModelType, ToolType } from "../types/ai.types";
import { User } from "./User";
import { EnumTransformer, JSONTransformer } from "../utils/db";
import { ApiProvider } from "../config/ai/common";

const JSON_COLUMN_TYPE = process.env.DB_TYPE == "mssql" ? "ntext" : "json";

export enum CustomModelProtocol {
  OPENAI_CHAT_COMPLETIONS = "OPENAI_CHAT_COMPLETIONS",
  OPENAI_RESPONSES = "OPENAI_RESPONSES",
}

@ObjectType("CustomModelSettings")
@InputType("CustomModelSettingsInput")
export class CustomModelSettings {
  @Field({ nullable: true })
  endpoint?: string;

  @Field({ nullable: true })
  protocol?: CustomModelProtocol;

  @Field({ nullable: true })
  apiKey?: string;

  @Field({ nullable: true })
  modelName?: string;

  @Field({ nullable: true })
  description?: string;
}

registerEnumType(ApiProvider, {
  name: "ApiProvider",
  description: "API provider for the model",
});
registerEnumType(ModelType, {
  name: "ModelType",
  description: "Type of model - chat or embeddings",
});
registerEnumType(ToolType, {
  name: "ToolType",
  description: "Type of tool that can be used in chat",
});
registerEnumType(ModelFeature, {
  name: "ModelFeature",
  description: "Features that can be enabled for the model",
});
registerEnumType(CustomModelProtocol, {
  name: "CustomModelProtocol",
  description: "Protocol for custom REST API models",
});

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

  @Field(() => ApiProvider)
  @Column({ default: ApiProvider.AWS_BEDROCK, transformer: EnumTransformer<ApiProvider>() })
  apiProvider: ApiProvider;

  @Field(() => ModelType)
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

  @Field(() => [ModelFeature], { nullable: true })
  @Column({ type: JSON_COLUMN_TYPE, nullable: true, transformer: JSONTransformer<ModelFeature[]>(), default: null })
  features?: ModelFeature[];

  @Field(() => [ToolType], { nullable: true })
  @Column({ type: JSON_COLUMN_TYPE, nullable: true, transformer: JSONTransformer<ToolType[]>(), default: null })
  tools?: ToolType[];

  @Field(() => CustomModelSettings, { nullable: true })
  @Column({ type: JSON_COLUMN_TYPE, nullable: true, transformer: JSONTransformer<CustomModelSettings>() })
  customSettings?: CustomModelSettings;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
