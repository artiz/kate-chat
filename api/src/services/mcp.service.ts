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

  public async findSystemMcpByUrl(url: string) {
    return this.mcpServerRepository
      .createQueryBuilder("server")
      .where({ url, access: EntityAccessType.SYSTEM })
      .getOne();
  }

  public async findByIds(ids: string[], userId: string): Promise<MCPServer[]> {
    return this.buildAccessibleServersQuery(userId)
      .where({ id: In(ids) })
      .getMany();
  }

  public async createServer(input: CreateMCPServerInput, userId?: string): Promise<MCPServer> {
    const isSystem = input.access === EntityAccessType.SYSTEM;
    const existing = isSystem
      ? await this.mcpServerRepository.findOne({ where: { url: input.url, access: EntityAccessType.SYSTEM } })
      : await this.mcpServerRepository.findOne({ where: { url: input.url, user: { id: userId } } });
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
      user: userId ? { id: userId } : undefined,
      isActive: true,
      access: (input.access as EntityAccessType) || EntityAccessType.PRIVATE,
    });

    const savedServer = await this.mcpServerRepository.save(server);
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

  public async refreshOauthToken({
    serverId,
    refreshToken,
    userId,
  }: {
    serverId: string;
    refreshToken: string;
    userId?: string;
  }): Promise<{ accessToken: string; expiresAt?: number; refreshToken?: string }> {
    const server = userId
      ? await this.getServerById({ id: serverId, userId })
      : await this.mcpServerRepository.findOne({ where: { id: serverId } });

    if (!server) throw new Error("MCP server not found");

    const { authConfig } = server;
    if (!authConfig?.tokenUrl || !authConfig?.clientId) {
      throw new Error("OAuth configuration incomplete - missing tokenUrl or clientId");
    }

    const tokenUrl = authConfig.tokenUrl;
    const clientId = authConfig.clientId;

    const sendRefreshRequest = async (useBasicClientAuth: boolean) => {
      const tokenParams = new URLSearchParams();
      tokenParams.set("grant_type", "refresh_token");
      tokenParams.set("refresh_token", refreshToken);
      tokenParams.set("client_id", clientId);
      if (!useBasicClientAuth && authConfig.clientSecret) {
        tokenParams.set("client_secret", authConfig.clientSecret);
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      };

      if (useBasicClientAuth && authConfig.clientSecret) {
        const basic = Buffer.from(`${clientId}:${authConfig.clientSecret}`).toString("base64");
        headers.Authorization = `Basic ${basic}`;
      }

      return fetch(tokenUrl, {
        method: "POST",
        headers,
        body: tokenParams.toString(),
      });
    };

    const readOAuthError = async (response: Response) => {
      const errorText = await response.text();
      let errorCode: string | undefined;
      let errorDescription: string | undefined;

      try {
        const parsed = JSON.parse(errorText);
        if (parsed && typeof parsed === "object") {
          errorCode = typeof parsed.error === "string" ? parsed.error : undefined;
          errorDescription = typeof parsed.error_description === "string" ? parsed.error_description : undefined;
        }
      } catch {
        // Ignore parse errors and fallback to raw error text.
      }

      return { errorText, errorCode, errorDescription };
    };

    let tokenResponse = await sendRefreshRequest(false);

    if (!tokenResponse.ok && authConfig.clientSecret) {
      const firstError = await readOAuthError(tokenResponse);
      const retryWithBasic =
        tokenResponse.status === 400 &&
        (firstError.errorCode === "invalid_client" || firstError.errorCode === "invalid_grant");

      if (retryWithBasic) {
        logger.debug(
          { serverId, status: tokenResponse.status, errorCode: firstError.errorCode },
          "Retrying OAuth refresh with Basic client auth"
        );
        tokenResponse = await sendRefreshRequest(true);
      } else {
        logger.warn(
          { status: tokenResponse.status, error: firstError.errorText, errorCode: firstError.errorCode, serverId },
          "OAuth token refresh failed"
        );
        const detail = firstError.errorDescription || firstError.errorCode || `HTTP ${tokenResponse.status}`;
        throw new Error(`OAuth token refresh failed: ${detail}`);
      }
    }

    if (!tokenResponse.ok) {
      const oauthError = await readOAuthError(tokenResponse);
      logger.warn(
        { status: tokenResponse.status, error: oauthError.errorText, errorCode: oauthError.errorCode, serverId },
        "OAuth token refresh failed"
      );
      const detail = oauthError.errorDescription || oauthError.errorCode || `HTTP ${tokenResponse.status}`;
      throw new Error(`OAuth token refresh failed: ${detail}`);
    }

    const tokenData: any = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      throw new Error("No access_token in OAuth refresh response");
    }

    const expiresIn = tokenData.expires_in;
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : undefined;
    const newRefreshToken = tokenData.refresh_token || undefined;

    logger.debug({ serverId, expiresIn }, "OAuth token refresh successful");
    return { accessToken, expiresAt, refreshToken: newRefreshToken };
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
