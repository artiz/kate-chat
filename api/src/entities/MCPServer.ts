import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn, ManyToOne } from "typeorm";
import { Field, ID, ObjectType, registerEnumType, InputType } from "type-graphql";
import { IsOptional, Validate } from "class-validator";
import { User } from "./User";
import { JSONTransformer, EnumTransformer } from "../utils/db";
import { IsPublicUrl } from "../utils/validators";

const JSON_COLUMN_TYPE = process.env.DB_TYPE == "mssql" ? "ntext" : "json";

export enum MCPTransportType {
  STREAMABLE_HTTP = "STREAMABLE_HTTP",
  HTTP_SSE_LEGACY = "HTTP_SSE_LEGACY",
}

export enum MCPAuthType {
  NONE = "NONE",
  API_KEY = "API_KEY",
  BEARER = "BEARER",
  OAUTH2 = "OAUTH2",
}

export const MCP_DEFAULT_API_KEY_HEADER = "X-API-Key";

registerEnumType(MCPTransportType, {
  name: "MCPTransportType",
  description: "Transport type for MCP server",
});

registerEnumType(MCPAuthType, {
  name: "MCPAuthType",
  description: "Authentication type for MCP server",
});

@ObjectType("MCPAuthConfig")
@InputType("MCPAuthConfigInput")
export class MCPAuthConfig {
  @Field({ nullable: true })
  headerName?: string; // e.g., "Authorization", "X-API-Key"

  @Field({ nullable: true })
  clientId?: string;

  @Field({ nullable: true })
  clientSecret?: string;

  @Field({ nullable: true })
  tokenUrl?: string;

  @Field({ nullable: true })
  authorizationUrl?: string; // OAuth2 authorization URL

  @Field({ nullable: true })
  scope?: string; // OAuth2 scope
}

@ObjectType("MCPToolInfo")
export class MCPToolInfo {
  @Field()
  name: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  inputSchema?: string; // JSON string of the input schema

  @Field({ nullable: true })
  outputSchema?: string; // JSON string of the output schema
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

  @Field(() => MCPTransportType)
  @Column({ default: MCPTransportType.STREAMABLE_HTTP, transformer: EnumTransformer<MCPTransportType>() })
  transportType: MCPTransportType;

  @Field(() => MCPAuthType)
  @Column({ default: MCPAuthType.NONE, transformer: EnumTransformer<MCPAuthType>() })
  authType: MCPAuthType;

  @Field(() => MCPAuthConfig, { nullable: true })
  @Column({ type: JSON_COLUMN_TYPE, nullable: true, transformer: JSONTransformer<MCPAuthConfig>() })
  authConfig?: MCPAuthConfig;

  @Field(() => [MCPToolInfo], { nullable: true })
  @Column({ type: JSON_COLUMN_TYPE, nullable: true, transformer: JSONTransformer<MCPToolInfo[]>() })
  tools?: MCPToolInfo[];

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
