import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn, OneToMany, Index } from "typeorm";
import { Field, ID, InputType, ObjectType } from "type-graphql";
import { Model } from "./Model";
import { Document } from "./Document";
import { JSONTransformer } from "../utils/db";
import { TokenPayload } from "../utils/jwt";
import { DB_TYPE } from "../config/env";
import { ApiProvider, CredentialSourceType, CredentialType } from "@/types/api";

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

const JSON_COLUMN_TYPE = DB_TYPE == "mssql" ? "ntext" : "json";

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
  @Column({ nullable: true, default: 0.7, type: "float" })
  defaultTemperature?: number;

  @Field({ nullable: true })
  @Column({ nullable: true, default: 2048, type: "integer" })
  defaultMaxTokens?: number;

  @Field({ nullable: true })
  @Column({ nullable: true, default: 0.9, type: "float" })
  defaultTopP?: number;

  @Field({ nullable: true })
  @Column({ nullable: true, default: 1, type: "integer" })
  defaultImagesCount?: number;

  @Field({ nullable: true })
  @Column({ nullable: true })
  avatarUrl?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  googleId?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  githubId?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  microsoftId?: string;

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

  getProviderCredentialsSource(provider: CredentialType): CredentialSourceType | undefined {
    if (!this.settings) return undefined;
    switch (provider) {
      case ApiProvider.AWS_BEDROCK:
        if (this.settings.awsBedrockAccessKeyId && this.settings.awsBedrockSecretAccessKey) {
          return "DATABASE";
        }
        return undefined;
      case ApiProvider.OPEN_AI:
        if (this.settings.openaiApiKey) {
          return "DATABASE";
        }
        return undefined;
      case ApiProvider.YANDEX_FM:
        if (this.settings.yandexFmApiKey && this.settings.yandexFmApiFolderId) {
          return "DATABASE";
        }
        return undefined;
      case "S3":
        if (this.settings.s3AccessKeyId && this.settings.s3SecretAccessKey) {
          return "DATABASE";
        }
        return undefined;
      default:
        return undefined;
    }
  }

  isAdmin(): boolean {
    return this.role === UserRole.ADMIN;
  }
}
