import { Resolver, Query, Ctx, Arg, Mutation, FieldResolver, Root } from "type-graphql";
import { MCPServer, MCPAuthConfig } from "../entities";
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
import { Repository } from "typeorm";
import { MCPAuthToken } from "@/types/ai.types";
import { MCPAuthType, MCPTransportType } from "@/types/api";

const logger = createLogger(__filename);

@Resolver(() => MCPServer)
export class MCPServerResolver extends BaseResolver {
  mcpServerRepository: Repository<MCPServer>;

  constructor() {
    super();

    this.mcpServerRepository = getRepository(MCPServer);
  }

  /**
   * Fetch tools from an MCP server and store them in the database
   */
  private async fetchAndStoreTools(server: MCPServer, authToken?: string): Promise<MCPServer> {
    const client = MCPClient.connect(server, MCPAuthToken.of(authToken, server.id));
    const tools = await client.listTools();
    server.tools = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : undefined,
      outputSchema: tool.outputSchema ? JSON.stringify(tool.outputSchema, null, 2) : undefined,
    }));
    await this.mcpServerRepository.save(server);
    await client.close();
    logger.debug({ serverId: server.id, toolsCount: server.tools?.length }, "Fetched and stored MCP tools");
    return server;
  }

  @Query(() => MCPServersListResponse)
  async getMCPServers(@Ctx() context: GraphQLContext): Promise<MCPServersListResponse> {
    const user = await this.validateContextUser(context);

    try {
      const servers = await this.mcpServerRepository.find({
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
  async createMCPServer(
    @Arg("input") input: CreateMCPServerInput,
    @Ctx() context: GraphQLContext
  ): Promise<MCPServerResponse> {
    const user = await this.validateContextUser(context);

    try {
      // Check if server with same URL already exists for this user
      const existingServer = await this.mcpServerRepository.findOne({
        where: { url: input.url, user: { id: user.id } },
      });

      if (existingServer) {
        return { error: "An MCP server with this URL already exists" };
      }

      const server = this.mcpServerRepository.create({
        name: input.name,
        url: input.url,
        description: input.description,
        transportType: (input.transportType as MCPTransportType) || MCPTransportType.STREAMABLE_HTTP,
        authType: (input.authType as MCPAuthType) || MCPAuthType.NONE,
        authConfig: input.authConfig as MCPAuthConfig,
        user: { id: user.id },
        isActive: true,
      });

      // Save server first to get an ID for the MCP client
      const savedServer = await this.mcpServerRepository.save(server);
      logger.debug({ serverId: savedServer.id, name: savedServer.name }, "Created MCP server");

      if (savedServer.authType == MCPAuthType.NONE) {
        await this.fetchAndStoreTools(savedServer);
      }

      return { server: savedServer };
    } catch (error) {
      logger.error(error, "Error creating MCP server");
      return { error: "Failed to create MCP server" };
    }
  }

  @Mutation(() => MCPServerResponse)
  async updateMCPServer(
    @Arg("input") input: UpdateMCPServerInput,
    @Ctx() context: GraphQLContext
  ): Promise<MCPServerResponse> {
    const user = await this.validateContextUser(context);

    try {
      const server = await this.mcpServerRepository.findOne({
        where: { id: input.id, user: { id: user.id } },
      });

      if (!server) {
        return { error: "MCP server not found" };
      }

      // Update fields if provided
      const fields: (keyof UpdateMCPServerInput)[] = [
        "name",
        "url",
        "description",
        "transportType",
        "authType",
        "authConfig",
        "isActive",
      ];
      for (const field of fields) {
        if (input[field] !== undefined) {
          if (field === "authConfig") {
            if (input.authType === MCPAuthType.NONE) {
              server.authConfig = undefined;
            } else if (input.authType === MCPAuthType.OAUTH2) {
              const currentSecret = server.authConfig?.clientSecret;
              server.authConfig = { ...server.authConfig, ...input.authConfig };
              if (currentSecret && !server.authConfig.clientSecret) {
                server.authConfig.clientSecret = currentSecret;
              }
            } else {
              server.authConfig = input.authConfig;
            }
          } else {
            (server as Record<keyof UpdateMCPServerInput, string | boolean | MCPAuthType | MCPAuthConfig>)[field] =
              input[field];
          }
        }
      }

      const savedServer = await this.mcpServerRepository.save(server);
      if (savedServer.authType == MCPAuthType.NONE) {
        await this.fetchAndStoreTools(savedServer);
      }

      return { server: savedServer };
    } catch (error) {
      logger.error(error, "Error updating MCP server");
      return { error: "Failed to update MCP server" };
    }
  }

  @Mutation(() => Boolean)
  async deleteMCPServer(@Arg("input") input: DeleteMCPServerInput, @Ctx() context: GraphQLContext): Promise<boolean> {
    const user = await this.validateContextUser(context);

    try {
      const server = await this.mcpServerRepository.findOne({
        where: { id: input.id, user: { id: user.id } },
      });

      if (!server) {
        throw new Error("MCP server not found");
      }

      await this.mcpServerRepository.remove(server);
      logger.debug({ serverId: input.id }, "Deleted MCP server");

      return true;
    } catch (error) {
      logger.error(error, "Error deleting MCP server");
      throw error;
    }
  }

  @Mutation(() => MCPServerResponse)
  async refetchMcpServerTools(
    @Arg("serverId") serverId: string,
    @Arg("authToken", { nullable: true }) authToken: string,
    @Ctx() context: GraphQLContext
  ): Promise<MCPServerResponse> {
    const user = await this.validateContextUser(context);

    try {
      const server = await this.mcpServerRepository.findOne({
        where: { id: serverId, user: { id: user.id } },
      });

      if (!server) {
        return { error: "MCP server not found" };
      }

      const savedServer = await this.fetchAndStoreTools(server, authToken);

      return { server: savedServer };
    } catch (error) {
      logger.error(error, "Error refetching MCP server tools");
      return { error: `Failed to refetch tools: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  @Query(() => MCPToolsListResponse)
  async getMCPServerTools(
    @Arg("serverId") serverId: string,
    @Arg("authToken", { nullable: true }) authToken: string,
    @Ctx() context: GraphQLContext
  ): Promise<MCPToolsListResponse> {
    const user = await this.validateContextUser(context);

    const server = await this.mcpServerRepository.findOne({
      where: { id: serverId, user: { id: user.id } },
    });

    if (!server) {
      return { error: "MCP server not found" };
    }

    const client = MCPClient.connect(server, MCPAuthToken.of(authToken, server.id));

    try {
      const tools = await client.listTools();

      return {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : undefined,
          outputSchema: tool.outputSchema ? JSON.stringify(tool.outputSchema, null, 2) : undefined,
        })),
      };
    } catch (error) {
      logger.error(error, "Error fetching MCP server tools");
      return { error: `Failed to fetch tools: ${error instanceof Error ? error.message : String(error)}` };
    } finally {
      await client.close();
    }
  }

  @Mutation(() => MCPToolTestResponse)
  async testMCPTool(
    @Arg("input") input: TestMCPToolInput,
    @Ctx() context: GraphQLContext
  ): Promise<MCPToolTestResponse> {
    const user = await this.validateContextUser(context);

    const server = await this.mcpServerRepository.findOne({
      where: { id: input.serverId, user: { id: user.id } },
    });

    if (!server) {
      return { error: "MCP server not found" };
    }

    const client = MCPClient.connect(server, MCPAuthToken.of(input.authToken, input.serverId));

    try {
      const args = input.argsJson ? JSON.parse(input.argsJson) : {};
      const result = await client.callTool(input.toolName, args);

      await client.close();

      return { result: JSON.stringify(result, null, 2) };
    } catch (error) {
      logger.error(error, "Error testing MCP tool");
      return { error: `Failed to test tool: ${error instanceof Error ? error.message : String(error)}` };
    } finally {
      await client.close();
    }
  }
}

@Resolver(() => MCPAuthConfig)
export class MCPAuthConfigResolver {
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
