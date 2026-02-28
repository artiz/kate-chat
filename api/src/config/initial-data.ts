import { getRepository } from "@/config/database";
import { globalConfig, InitialCustomModel } from "@/global-config";
import { MCPAuthConfig, MCPServer, Model } from "@/entities";
import { CustomModelProtocol } from "@/entities/Model";
import { User } from "@/entities/User";
import { logger } from "@/utils/logger";
import { ApiProvider, MCPAuthType, MCPTransportType, ModelType } from "@/types/api";

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
    const token = serverConfig.tokenEnv ? process.env[serverConfig.tokenEnv] : undefined;
    let mergedAuthConfig: MCPAuthConfig | undefined = authConfig ? { ...authConfig } : undefined;
    if (token) {
      if (mergedAuthConfig) {
        mergedAuthConfig.clientSecret = token;
      } else {
        mergedAuthConfig = { clientSecret: token };
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
      authConfig: mergedAuthConfig,
      isActive: true,
    });

    await mcpRepo.save(server);
    logger.info({ userId: user.id, url: serverConfig.url }, "Created initial MCP server for user");
  }
}
