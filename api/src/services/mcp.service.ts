import { In, Repository, SelectQueryBuilder } from "typeorm";
import { createLogger } from "@/utils/logger";
import { getRepository } from "@/config/database";
import { MCPServer, MCPAuthConfig } from "@/entities";
import { EntityAccessType, MCPAuthType, MCPTransportType } from "@/types/api";
import { MCPClient } from "@/services/ai/tools/mcp.client";
import { MCPAuthToken } from "@/types/ai.types";
import { CreateMCPServerInput, UpdateMCPServerInput } from "@/types/graphql/inputs";

const logger = createLogger(__filename);

export class McpServersService {
  private mcpServerRepository: Repository<MCPServer>;

  constructor() {
    this.mcpServerRepository = getRepository(MCPServer);
  }

  public async getServers(userId: string): Promise<MCPServer[]> {
    return this.buildAccessibleServersQuery(userId).getMany();
  }

  public async getServerById({ id, userId }: { id: string; userId: string }): Promise<MCPServer | null> {
    return this.buildAccessibleServersQuery(userId).where({ id }).getOne();
  }

  public async findByIds(ids: string[], userId: string): Promise<MCPServer[]> {
    return this.buildAccessibleServersQuery(userId)
      .where({ id: In(ids) })
      .getMany();
  }

  public async createServer(input: CreateMCPServerInput, userId: string): Promise<MCPServer> {
    const existing = await this.mcpServerRepository.findOne({
      where: { url: input.url, user: { id: userId } },
    });
    if (existing) {
      throw new Error("An MCP server with this URL already exists");
    }

    const server = this.mcpServerRepository.create({
      name: input.name,
      url: input.url,
      description: input.description,
      transportType: (input.transportType as MCPTransportType) || MCPTransportType.STREAMABLE_HTTP,
      authType: (input.authType as MCPAuthType) || MCPAuthType.NONE,
      authConfig: input.authConfig as MCPAuthConfig,
      user: { id: userId },
      isActive: true,
      access: (input.access as EntityAccessType) || EntityAccessType.PRIVATE,
    });

    const savedServer = await this.mcpServerRepository.save(server);
    logger.debug({ serverId: savedServer.id, name: savedServer.name }, "Created MCP server");

    if (savedServer.authType === MCPAuthType.NONE) {
      await this.fetchAndStoreTools(savedServer);
    }

    return savedServer;
  }

  public async updateServer(input: UpdateMCPServerInput, userId: string): Promise<MCPServer | null> {
    const server = await this.getServerById({ id: input.id, userId });
    if (!server) return null;

    const fields: (keyof UpdateMCPServerInput)[] = [
      "name",
      "url",
      "description",
      "transportType",
      "authType",
      "authConfig",
      "isActive",
      "access",
    ];

    for (const field of fields) {
      if (input[field] !== undefined) {
        if (field === "authConfig") {
          if (input.authType === MCPAuthType.NONE) {
            server.authConfig = undefined;
          } else if (input.authType === MCPAuthType.OAUTH2) {
            server.authConfig = { ...server.authConfig, ...input.authConfig };
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
    if (savedServer.authType === MCPAuthType.NONE) {
      await this.fetchAndStoreTools(savedServer);
    }

    return savedServer;
  }

  public async deleteServer(id: string, userId: string): Promise<void> {
    const server = await this.getServerById({ id, userId });
    if (!server) throw new Error("MCP server not found");
    await this.mcpServerRepository.remove(server);
    logger.debug({ serverId: id }, "Deleted MCP server");
  }

  public async fetchAndStoreTools(server: MCPServer, authToken?: string): Promise<MCPServer> {
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

  public async getServerTools(
    id: string,
    userId: string,
    authToken?: string
  ): Promise<{ name: string; description?: string; inputSchema?: string; outputSchema?: string }[]> {
    const server = await this.getServerById({ id, userId });
    if (!server) throw new Error("MCP server not found");

    const client = MCPClient.connect(server, MCPAuthToken.of(authToken, server.id));
    try {
      const tools = await client.listTools();
      return tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : undefined,
        outputSchema: tool.outputSchema ? JSON.stringify(tool.outputSchema, null, 2) : undefined,
      }));
    } finally {
      await client.close();
    }
  }

  public async testTool(
    id: string,
    userId: string,
    toolName: string,
    argsJson?: string,
    authToken?: string
  ): Promise<string> {
    const server = await this.getServerById({ id, userId });
    if (!server) throw new Error("MCP server not found");

    const client = MCPClient.connect(server, MCPAuthToken.of(authToken, id));
    try {
      const args = argsJson ? JSON.parse(argsJson) : {};
      const result = await client.callTool(toolName, args);
      return JSON.stringify(result, null, 2);
    } finally {
      await client.close();
    }
  }

  private buildAccessibleServersQuery(userId: string): SelectQueryBuilder<MCPServer> {
    return this.mcpServerRepository
      .createQueryBuilder("server")
      .where("(server.userId = :userId OR (server.access IN (:...accessTypes) AND server.isActive = :isActive))", {
        userId,
        accessTypes: [EntityAccessType.SYSTEM, EntityAccessType.SHARED],
        isActive: true,
      })
      .orderBy("server.createdAt", "DESC");
  }
}
