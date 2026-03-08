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
import { GraphQLContext } from ".";
import { createLogger } from "@/utils/logger";
import { obfuscateSecret } from "@/utils/format";
import { McpServersService } from "@/services/mcp.service";
import { EntityAccessType } from "@/types/api";

const logger = createLogger(__filename);

@Resolver(() => MCPServer)
export class MCPServerResolver extends BaseResolver {
  service: McpServersService;

  constructor() {
    super();
    this.service = new McpServersService();
  }

  @Query(() => MCPServersListResponse)
  async mcpServers(@Ctx() context: GraphQLContext): Promise<MCPServersListResponse> {
    const user = await this.validateContextUser(context);
    try {
      const servers = await this.service.getServers(user.id);
      return { servers, total: servers.length };
    } catch (error) {
      logger.error(error, "Error fetching MCP servers");
      return { error: "Failed to fetch MCP servers" };
    }
  }

  @Mutation(() => MCPServerResponse)
  async createMcpServer(
    @Arg("input") input: CreateMCPServerInput,
    @Ctx() context: GraphQLContext
  ): Promise<MCPServerResponse> {
    const user = await this.validateContextUser(context);
    try {
      const server = await this.service.createServer(input, user.id);
      return { server };
    } catch (error) {
      logger.error(error, "Error creating MCP server");
      return { error: error instanceof Error ? error.message : "Failed to create MCP server" };
    }
  }

  @Mutation(() => MCPServerResponse)
  async updateMcpServer(
    @Arg("input") input: UpdateMCPServerInput,
    @Ctx() context: GraphQLContext
  ): Promise<MCPServerResponse> {
    const user = await this.validateContextUser(context);
    try {
      const server = await this.service.updateServer(input, user.id);
      if (!server) return { error: "MCP server not found" };
      return { server };
    } catch (error) {
      logger.error(error, "Error updating MCP server");
      return { error: "Failed to update MCP server" };
    }
  }

  @Mutation(() => Boolean)
  async deleteMcpServer(@Arg("input") input: DeleteMCPServerInput, @Ctx() context: GraphQLContext): Promise<boolean> {
    const user = await this.validateContextUser(context);
    try {
      await this.service.deleteServer(input.id, user.id);
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
      const server = await this.service.getServerById({ id: serverId, userId: user.id });
      if (!server) return { error: "MCP server not found" };
      if (server.access !== EntityAccessType.SYSTEM && server.userId !== user.id) {
        return { error: "Server could be updated only by owner" };
      }
      if (server.access === EntityAccessType.SYSTEM && !user.isAdmin()) {
        return { error: "System server could be updated only by admin" };
      }

      const savedServer = await this.service.fetchAndStoreTools(server, authToken);
      return { server: savedServer };
    } catch (error) {
      logger.error(error, "Error refetching MCP server tools");
      return { error: `Failed to refetch tools: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  @Query(() => MCPToolsListResponse)
  async getMcpServerTools(
    @Arg("serverId") serverId: string,
    @Arg("authToken", { nullable: true }) authToken: string,
    @Ctx() context: GraphQLContext
  ): Promise<MCPToolsListResponse> {
    const user = await this.validateContextUser(context);
    try {
      const tools = await this.service.getServerTools(serverId, user.id, authToken);
      return { tools };
    } catch (error) {
      logger.error(error, "Error fetching MCP server tools");
      return { error: `Failed to fetch tools: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  @Mutation(() => MCPToolTestResponse)
  async testMcpTool(
    @Arg("input") input: TestMCPToolInput,
    @Ctx() context: GraphQLContext
  ): Promise<MCPToolTestResponse> {
    const user = await this.validateContextUser(context);
    try {
      logger.debug(input, "Testing MCP tool with input");

      const result = await this.service.testTool(
        input.serverId,
        user.id,
        input.toolName,
        input.argsJson,
        input.authToken
      );
      return { result };
    } catch (error) {
      logger.error(error, "Error testing MCP tool");
      return { error: `Failed to test tool: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}

@Resolver(() => MCPAuthConfig)
export class MCPAuthConfigResolver {
  @FieldResolver(() => String, { nullable: true })
  clientSecret(@Root() config: MCPAuthConfig): string | undefined {
    return obfuscateSecret(config.clientSecret);
  }
}
