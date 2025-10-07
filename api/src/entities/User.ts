import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn, OneToMany, Index } from "typeorm";
import { Field, ID, InputType, ObjectType } from "type-graphql";
import { Model } from "./Model";
import { Document } from "./Document";
import { JSONTransformer } from "../utils/db";
import { TokenPayload } from "../utils/jwt";
import { ConnectionParams } from "../middleware/auth.middleware";

export enum AuthProvider {
  LOCAL = "local",
  GOOGLE = "google",
  GITHUB = "github",
  MICROSOFT = "microsoft",
}

export enum UserRole {
  USER = "user",
  ADMIN = "admin",
}

const JSON_COLUMN_TYPE = process.env.DB_TYPE == "mssql" ? "ntext" : "json";

@ObjectType("UserSettings")
@InputType("UserSettingsInput")
export class UserSettings {
  @Field({ nullable: true })
  s3Endpoint?: string;
  @Field({ nullable: true })
  s3Region?: string;
  @Field({ nullable: true })
  s3AccessKeyId?: string;
  @Field({ nullable: true })
  s3SecretAccessKey?: string;
  @Field({ nullable: true })
  s3FilesBucketName?: string;
  @Field({ nullable: true })
  s3Profile?: string;

  @Field({ nullable: true })
  awsBedrockRegion?: string;
  @Field({ nullable: true })
  awsBedrockProfile?: string;
  @Field({ nullable: true })
  awsBedrockAccessKeyId?: string;
  @Field({ nullable: true })
  awsBedrockSecretAccessKey?: string;

  @Field({ nullable: true })
  openaiApiKey?: string;
  @Field({ nullable: true })
  openaiApiAdminKey?: string;

  @Field({ nullable: true })
  yandexFmApiKey?: string;
  @Field({ nullable: true })
  yandexFmApiFolderId?: string;
}

@ObjectType()
@Entity("users")
export class User {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Field()
  @Column()
  @Index({ fulltext: true })
  firstName: string;

  @Field()
  @Column()
  @Index({ fulltext: true })
  lastName: string;

  @Field(() => String)
  @Column({ type: "varchar", default: UserRole.USER })
  role: UserRole;

  @Field({ nullable: true })
  @Column({ nullable: true })
  defaultModelId?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  documentsEmbeddingsModelId?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  documentSummarizationModelId?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  defaultSystemPrompt?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  avatarUrl?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  googleId?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  githubId?: string;

  @Field(() => String, { nullable: true })
  @Column({ nullable: true, type: "varchar" })
  authProvider?: AuthProvider;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @Field(() => [Model], { nullable: true })
  @OneToMany(() => Model, m => m.user, { cascade: true, onDelete: "CASCADE" })
  models: Model[];

  @Field(() => [Document], { nullable: true })
  @OneToMany(() => Document, d => d.owner, { cascade: true, onDelete: "CASCADE" })
  documents: Document[];

  @Field({ nullable: true })
  @Column({
    nullable: true,
    select: false,
    name: "modelsCount",
  })
  modelsCount?: number;

  @Field({ nullable: true })
  @Column({
    nullable: true,
    select: false,
    name: "chatsCount",
  })
  chatsCount?: number;

  @Field(() => UserSettings, { nullable: true })
  @Column({ type: JSON_COLUMN_TYPE, nullable: true, transformer: JSONTransformer<UserSettings>() })
  settings?: UserSettings;

  toToken(): TokenPayload {
    return {
      userId: this.id,
      email: this.email,
      roles: [this.role],
    };
  }

  isAdmin(): boolean {
    return this.role === UserRole.ADMIN;
  }

  static getConnectionInfo(user?: User): ConnectionParams {
    return {
      AWS_BEDROCK_REGION: user?.settings?.awsBedrockRegion || process.env.AWS_BEDROCK_REGION,
      AWS_BEDROCK_PROFILE: user?.settings?.awsBedrockProfile || process.env.AWS_BEDROCK_PROFILE,
      AWS_BEDROCK_ACCESS_KEY_ID: user?.settings?.awsBedrockAccessKeyId || process.env.AWS_BEDROCK_ACCESS_KEY_ID,
      AWS_BEDROCK_SECRET_ACCESS_KEY:
        user?.settings?.awsBedrockSecretAccessKey || process.env.AWS_BEDROCK_SECRET_ACCESS_KEY,
      OPENAI_API_KEY: user?.settings?.openaiApiKey || process.env.OPENAI_API_KEY,
      OPENAI_API_ADMIN_KEY: user?.settings?.openaiApiAdminKey || process.env.OPENAI_API_ADMIN_KEY,
      YANDEX_FM_API_KEY: user?.settings?.yandexFmApiKey || process.env.YANDEX_FM_API_KEY,
      YANDEX_FM_API_FOLDER: user?.settings?.yandexFmApiFolderId || process.env.YANDEX_FM_API_FOLDER,
    };
  }
}
