import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  OneToMany,
} from "typeorm";
import { AuthProvider, UserRole } from "../types/ai.types";
import { Field, ID, InputType, ObjectType } from "type-graphql";
import { Model } from "./Model";
import { JSONTransformer } from "@/utils/db";
import { TokenPayload } from "@/utils/jwt";

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
  firstName: string;

  @Field()
  @Column()
  lastName: string;

  @Field(() => String)
  @Column({ type: "varchar", default: UserRole.USER })
  role: UserRole;

  @Field({ nullable: true })
  @Column({ nullable: true })
  defaultModelId?: string;

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

  @Field(() => UserSettings, { nullable: true })
  @Column({ type: "json", nullable: true, transformer: JSONTransformer<UserSettings>() })
  settings?: UserSettings;

  toToken(): TokenPayload {
    return {
      userId: this.id,
      email: this.email,
      roles: [this.role],
    };
  }
}
