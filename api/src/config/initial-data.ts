import { getRepository } from "@/config/database";
import { globalConfig, InitialCustomModel } from "@/global-config";
import { MCPAuthConfig, MCPServer, Model } from "@/entities";
import { CustomModelProtocol } from "@/entities/Model";
import { User } from "@/entities/User";
import { logger } from "@/utils/logger";
import { ApiProvider, EntityAccessType, MCPAuthType, MCPTransportType, ModelType } from "@/types/api";
import { MCP_SERVERS } from "@/services/mcp";
import { McpServersService } from "@/services/mcp.service";

function resolveApiKey(modelConfig: InitialCustomModel): string | undefined {
  if (modelConfig.apiKeyEnv) {
    return process.env[modelConfig.apiKeyEnv];
  }
  return undefined;
}

const resolveProtocol = (protocol?: string): CustomModelProtocol | undefined => {
  if (!protocol) return undefined;
  return protocol as CustomModelProtocol;
};

export async function ensureSystemMCPServers() {
  const { enabledMcp } = globalConfig.ai;
  if (!enabledMcp || !enabledMcp.length) return;

  const { callbackUrlBase } = globalConfig.runtime;
  const mcpService = new McpServersService();

  for (const mcpName of enabledMcp) {
    const mcpEntry = MCP_SERVERS[mcpName];
    if (!mcpEntry) {
      logger.warn({ mcpName }, "No system MCP server implementation found, skipping");
      continue;
    }

    const url = `${callbackUrlBase}/mcp/${mcpName}`;
    const existing = await mcpService.findSystemMcpByUrl(url);
    if (existing) continue;

    const envKey = mcpName.toUpperCase();
    const clientId = process.env[`MCP_SERVER_${envKey}_CLIENT_ID`];
    const clientSecret = process.env[`MCP_SERVER_${envKey}_CLIENT_SECRET`];

    await mcpService.createServer({
      name: mcpEntry.name,
      url,
      description: mcpEntry.description,
      transportType: MCPTransportType.STREAMABLE_HTTP,
      authType: MCPAuthType.OAUTH2,
      authConfig: {
        clientId,
        clientSecret,
        authorizationUrl: mcpEntry.authorizationUrl,
        tokenUrl: mcpEntry.tokenUrl,
        scope: mcpEntry.scope,
      } as MCPAuthConfig,
      access: EntityAccessType.SYSTEM,
    });

    logger.info({ url, name: mcpEntry.name }, "Created system MCP server");
  }
}

export async function ensureInitialUserAssets(user: User) {
  const { initial } = globalConfig;
  if (!initial) return;

  const modelRepo = getRepository(Model);
  const mcpRepo = getRepository(MCPServer);

  const createModels = initial.models || [];
  for (const modelConfig of createModels) {
    const existing = await modelRepo.findOne({ where: { userId: user.id, modelId: modelConfig.modelId } });
    if (existing) continue;

    const model = modelRepo.create({
      user,
      userId: user.id,
      name: modelConfig.name,
      modelId: modelConfig.modelId,
      description: modelConfig.description,
      provider: modelConfig.apiProvider || ApiProvider.CUSTOM_REST_API,
      apiProvider: (modelConfig.apiProvider as ApiProvider) || ApiProvider.CUSTOM_REST_API,
      type: modelConfig.type === "EMBEDDING" ? ModelType.EMBEDDING : ModelType.CHAT,
      streaming: true,
      imageInput: false,
      isActive: true,
      isCustom: true,
      customSettings: {
        protocol: resolveProtocol(modelConfig.protocol),
        endpoint: modelConfig.baseUrl,
        apiKey: resolveApiKey(modelConfig),
        modelName: modelConfig.modelName || modelConfig.modelId,
      },
    });

    await modelRepo.save(model);
    logger.info({ userId: user.id, modelId: modelConfig.modelId }, "Created initial custom model for user");
  }

  const createMcpServers = initial.mcpServers || [];
  for (const serverConfig of createMcpServers) {
    const existing = await mcpRepo.findOne({ where: { userId: user.id, url: serverConfig.url } });
    if (existing) continue;

    const authConfig: MCPAuthConfig | undefined =
      serverConfig.authConfig && typeof serverConfig.authConfig === "object"
        ? (serverConfig.authConfig as MCPAuthConfig)
        : undefined;

    if (authConfig) {
      if (serverConfig.authConfig?.clientIdEnv) {
        authConfig.clientId = process.env[serverConfig.authConfig.clientIdEnv];
      }
      if (serverConfig.authConfig?.clientSecretEnv) {
        authConfig.clientSecret = process.env[serverConfig.authConfig.clientSecretEnv];
      }
    }

    const server = mcpRepo.create({
      user,
      userId: user.id,
      name: serverConfig.name,
      url: serverConfig.url,
      description: serverConfig.description,
      transportType: (serverConfig.transportType as MCPTransportType) || MCPTransportType.STREAMABLE_HTTP,
      authType: (serverConfig.authType as MCPAuthType) || MCPAuthType.NONE,
      authConfig,
      isActive: true,
    });

    await mcpRepo.save(server);
    logger.info({ userId: user.id, url: serverConfig.url }, "Created initial MCP server for user");
  }
}
