import { Resolver, Query, Ctx, Authorized, Arg, Mutation, FieldResolver, Root } from "type-graphql";
import { MCPServer, MCPAuthType, MCPAuthConfig, UserRole } from "../entities";
import { BaseResolver } from "./base.resolver";
import {
  MCPServerResponse,
  MCPServersListResponse,
  MCPToolsListResponse,
  MCPToolTestResponse,
} from "../types/graphql/responses";
import {
  CreateMCPServerInput,
  UpdateMCPServerInput,
  DeleteMCPServerInput,
  TestMCPToolInput,
} from "../types/graphql/inputs";
import { getRepository } from "../config/database";
import { GraphQLContext } from ".";
import { createLogger } from "@/utils/logger";
import { MCPClient } from "@/services/ai/tools/mcp.client";

const logger = createLogger(__filename);

@Resolver(() => MCPServer)
export class MCPServerResolver extends BaseResolver {
  @Query(() => MCPServersListResponse)
  @Authorized(UserRole.ADMIN)
  async getMCPServers(@Ctx() context: GraphQLContext): Promise<MCPServersListResponse> {
    const user = await this.validateContextUser(context);

    try {
      const mcpServerRepository = getRepository(MCPServer);
      const servers = await mcpServerRepository.find({
        where: { user: { id: user.id } },
        order: { createdAt: "DESC" },
      });

      return {
        servers,
        total: servers.length,
      };
    } catch (error) {
      logger.error(error, "Error fetching MCP servers");
      return { error: "Failed to fetch MCP servers" };
    }
  }

  @Mutation(() => MCPServerResponse)
  @Authorized(UserRole.ADMIN)
  async createMCPServer(
    @Arg("input") input: CreateMCPServerInput,
    @Ctx() context: GraphQLContext
  ): Promise<MCPServerResponse> {
    const user = await this.validateContextUser(context);

    try {
      const mcpServerRepository = getRepository(MCPServer);

      // Check if server with same URL already exists for this user
      const existingServer = await mcpServerRepository.findOne({
        where: { url: input.url, user: { id: user.id } },
      });

      if (existingServer) {
        return { error: "An MCP server with this URL already exists" };
      }

      const server = mcpServerRepository.create({
        name: input.name,
        url: input.url,
        description: input.description,
        authType: (input.authType as MCPAuthType) || MCPAuthType.NONE,
        authConfig: input.authConfig as MCPAuthConfig,
        user: { id: user.id },
        isActive: true,
      });

      const savedServer = await mcpServerRepository.save(server);
      logger.debug({ serverId: savedServer.id, name: savedServer.name }, "Created MCP server");

      return { server: savedServer };
    } catch (error) {
      logger.error(error, "Error creating MCP server");
      return { error: "Failed to create MCP server" };
    }
  }

  @Mutation(() => MCPServerResponse)
  @Authorized(UserRole.ADMIN)
  async updateMCPServer(
    @Arg("input") input: UpdateMCPServerInput,
    @Ctx() context: GraphQLContext
  ): Promise<MCPServerResponse> {
    const user = await this.validateContextUser(context);

    try {
      const mcpServerRepository = getRepository(MCPServer);

      const server = await mcpServerRepository.findOne({
        where: { id: input.id, user: { id: user.id } },
      });

      if (!server) {
        return { error: "MCP server not found" };
      }

      // Update fields if provided
      if (input.name !== undefined) server.name = input.name;
      if (input.url !== undefined) server.url = input.url;
      if (input.description !== undefined) server.description = input.description;
      if (input.authType !== undefined) server.authType = input.authType as MCPAuthType;
      if (input.authConfig !== undefined) server.authConfig = input.authConfig as MCPAuthConfig;
      if (input.isActive !== undefined) server.isActive = input.isActive;

      const savedServer = await mcpServerRepository.save(server);
      logger.debug({ serverId: savedServer.id, name: savedServer.name }, "Updated MCP server");

      return { server: savedServer };
    } catch (error) {
      logger.error(error, "Error updating MCP server");
      return { error: "Failed to update MCP server" };
    }
  }

  @Mutation(() => Boolean)
  @Authorized(UserRole.ADMIN)
  async deleteMCPServer(@Arg("input") input: DeleteMCPServerInput, @Ctx() context: GraphQLContext): Promise<boolean> {
    const user = await this.validateContextUser(context);

    try {
      const mcpServerRepository = getRepository(MCPServer);

      const server = await mcpServerRepository.findOne({
        where: { id: input.id, user: { id: user.id } },
      });

      if (!server) {
        throw new Error("MCP server not found");
      }

      await mcpServerRepository.remove(server);
      logger.debug({ serverId: input.id }, "Deleted MCP server");

      return true;
    } catch (error) {
      logger.error(error, "Error deleting MCP server");
      throw error;
    }
  }

  @Query(() => MCPToolsListResponse)
  @Authorized(UserRole.ADMIN)
  async getMCPServerTools(
    @Arg("serverId") serverId: string,
    @Ctx() context: GraphQLContext
  ): Promise<MCPToolsListResponse> {
    const user = await this.validateContextUser(context);

    try {
      const mcpServerRepository = getRepository(MCPServer);

      const server = await mcpServerRepository.findOne({
        where: { id: serverId, user: { id: user.id } },
      });

      if (!server) {
        return { error: "MCP server not found" };
      }

      const client = new MCPClient(server);
      const tools = await client.listTools();

      return {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema ? JSON.stringify(tool.inputSchema) : undefined,
        })),
      };
    } catch (error) {
      logger.error(error, "Error fetching MCP server tools");
      return { error: `Failed to fetch tools: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  @Mutation(() => MCPToolTestResponse)
  @Authorized(UserRole.ADMIN)
  async testMCPTool(
    @Arg("input") input: TestMCPToolInput,
    @Ctx() context: GraphQLContext
  ): Promise<MCPToolTestResponse> {
    const user = await this.validateContextUser(context);

    try {
      const mcpServerRepository = getRepository(MCPServer);

      const server = await mcpServerRepository.findOne({
        where: { id: input.serverId, user: { id: user.id } },
      });

      if (!server) {
        return { error: "MCP server not found" };
      }

      const client = new MCPClient(server);
      const args = input.argsJson ? JSON.parse(input.argsJson) : {};
      const result = await client.callTool(input.toolName, args);

      return { result: JSON.stringify(result, null, 2) };
    } catch (error) {
      logger.error(error, "Error testing MCP tool");
      return { error: `Failed to test tool: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}

@Resolver(() => MCPAuthConfig)
export class MCPAuthConfigResolver {
  @FieldResolver(() => String, { nullable: true })
  apiKey(@Root() config: MCPAuthConfig): string | undefined {
    if (!config.apiKey) {
      return undefined;
    }

    // Mask the API key
    if (config.apiKey.length <= 10) {
      return "********";
    }
    return `${config.apiKey.substring(0, 3)}...${config.apiKey.substring(config.apiKey.length - 4)}`;
  }

  @FieldResolver(() => String, { nullable: true })
  bearerToken(@Root() config: MCPAuthConfig): string | undefined {
    if (!config.bearerToken) {
      return undefined;
    }

    // Mask the bearer token
    if (config.bearerToken.length <= 10) {
      return "********";
    }
    return `${config.bearerToken.substring(0, 3)}...${config.bearerToken.substring(config.bearerToken.length - 4)}`;
  }

  @FieldResolver(() => String, { nullable: true })
  clientSecret(@Root() config: MCPAuthConfig): string | undefined {
    if (!config.clientSecret) {
      return undefined;
    }

    // Mask the client secret
    if (config.clientSecret.length <= 10) {
      return "********";
    }
    return `${config.clientSecret.substring(0, 3)}...${config.clientSecret.substring(config.clientSecret.length - 4)}`;
  }
}
