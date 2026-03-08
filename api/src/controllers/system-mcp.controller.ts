import { Router, Request, Response } from "express";
import { globalConfig } from "@/global-config";
import { createLogger } from "@/utils/logger";
import { MCP_SERVERS } from "@/services/mcp";

const logger = createLogger(__filename);

export function createSystemMCPRouter(): Router {
  const router = Router();
  const { enabledMcp } = globalConfig.ai;

  if (!enabledMcp || Object.keys(enabledMcp).length === 0) {
    return router;
  }

  for (const mcpName of enabledMcp) {
    const config = MCP_SERVERS[mcpName];
    if (!config) {
      logger.error(`MCP handler not found for ${mcpName}`);
      continue;
    }

    const displayName = config.name || mcpName;

    router.all(`/${mcpName}`, async (req: Request, res: Response) => {
      const authHeader = req.headers.authorization || "";
      const authToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

      try {
        await config.handler(req, res, config, authToken);
      } catch (error) {
        logger.error(error, `Error handling ${displayName} request`);
        if (!res.headersSent) {
          res.status(500).json({ error: "Internal server error" });
        }
      }
    });

    logger.info(`System MCP server registered: "${displayName}" at /mcp/${mcpName}`);
  }

  return router;
}
