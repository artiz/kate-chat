import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn, ManyToOne } from "typeorm";
import { Field, ID, ObjectType, registerEnumType, InputType } from "type-graphql";
import { IsOptional, Validate } from "class-validator";
import { User } from "./User";
import { JSONTransformer, EnumTransformer } from "../utils/db";
import { IsPublicUrl } from "../utils/validators";

const JSON_COLUMN_TYPE = process.env.DB_TYPE == "mssql" ? "ntext" : "json";

export enum MCPAuthType {
  NONE = "NONE",
  API_KEY = "API_KEY",
  BEARER = "BEARER",
  OAUTH2 = "OAUTH2",
}

registerEnumType(MCPAuthType, {
  name: "MCPAuthType",
  description: "Authentication type for MCP server",
});

@ObjectType("MCPAuthConfig")
@InputType("MCPAuthConfigInput")
export class MCPAuthConfig {
  @Field({ nullable: true })
  apiKey?: string;

  @Field({ nullable: true })
  headerName?: string; // e.g., "Authorization", "X-API-Key"

  @Field({ nullable: true })
  bearerToken?: string;

  @Field({ nullable: true })
  clientId?: string;

  @Field({ nullable: true })
  clientSecret?: string;

  @Field({ nullable: true })
  tokenUrl?: string;
}

@ObjectType("MCPToolInfo")
export class MCPToolInfo {
  @Field()
  name: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  inputSchema?: string; // JSON string of the input schema
}

@ObjectType()
@Entity("mcp_servers")
export class MCPServer {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Column()
  name: string;

  @Field()
  @Column()
  @IsOptional()
  @Validate(IsPublicUrl)
  url: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  description?: string;

  @Field(() => MCPAuthType)
  @Column({ default: MCPAuthType.NONE, transformer: EnumTransformer<MCPAuthType>() })
  authType: MCPAuthType;

  @Field(() => MCPAuthConfig, { nullable: true })
  @Column({ type: JSON_COLUMN_TYPE, nullable: true, transformer: JSONTransformer<MCPAuthConfig>() })
  authConfig?: MCPAuthConfig;

  @Field()
  @Column({ default: true })
  isActive: boolean;

  @Field(() => User, { nullable: true })
  @ManyToOne(() => User, { nullable: true })
  user: User;

  @Field({ nullable: true })
  @Column({ nullable: true })
  userId?: string;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
