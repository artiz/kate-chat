import { Request, Response, NextFunction } from "express";
import { verifyToken, TokenPayload } from "../utils/jwt";
import { logger } from "../utils/logger";
import { IncomingHttpHeaders } from "http";
import { GraphQLContext } from "@/resolvers";
import { TokenExpiredError } from "jsonwebtoken";
import { globalConfig } from "@/global-config";

export interface ConnectionParams {
  awsBedrockRegion?: string;
  awsBedrockProfile?: string;
  awsBedrockAccessKeyId?: string;
  awsBedrockSecretAccessKey?: string;

  openAiApiKey?: string;
  openAiApiAdminKey?: string;

  yandexFmApiKey?: string;
  yandexFmApiFolder?: string;
  yandexSearchApiKey?: string;
  yandexSearchApiFolder?: string;
}

declare global {
  namespace Express {
    interface Request {
      tokenPayload?: TokenPayload;
      connectionParams?: ConnectionParams;
    }
  }
}

// GraphQL context authentication
export const getUserFromToken = (authHeader?: string): TokenPayload | null => {
  if (!authHeader) return null;

  // Handle both "Bearer token" format and direct token
  const token = authHeader.split(" ")[1] || authHeader;

  if (!token) return null;

  try {
    return verifyToken(token);
  } catch (error) {
    logger.debug({ error }, "Error verifying token");
    return null;
  }
};

export const graphQlAuthChecker = ({ context }: { context: GraphQLContext }, roles: string[]): boolean => {
  const user = context.tokenPayload;
  if (!user) return false;
  if (roles.length === 0) return true;

  // Check if user has any of the required roles
  return roles.some(role => user.roles?.includes(role));
};

// Export the middleware
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization || req.cookies["auth-token"] || req.cookies["authorization"];

    if (authHeader) {
      // Handle both "Bearer token" format and direct token
      const token = authHeader.split(" ")[1] || authHeader;
      if (token) {
        const tokenPayload = verifyToken(token);
        if (!tokenPayload) {
          logger.debug("Invalid or expired token");
        } else {
          req.tokenPayload = tokenPayload;
        }
      }
    }

    req.connectionParams = loadConnectionParams(req.headers);
    next();
  } catch (error) {
    next();
  }
};

const getHeader = (headerValue: string | string[] | undefined): string | undefined => {
  if (Array.isArray(headerValue)) {
    return headerValue[0];
  }
  return headerValue;
};

function loadConnectionParams(headers: IncomingHttpHeaders): ConnectionParams {
  return {
    awsBedrockRegion: getHeader(headers["x-aws-region"]) || globalConfig.bedrock.region,
    awsBedrockProfile: getHeader(headers["x-aws-profile"]) || globalConfig.bedrock.profile,
    awsBedrockAccessKeyId: getHeader(headers["x-aws-access-key-id"]) || globalConfig.bedrock.accessKeyId,
    awsBedrockSecretAccessKey: getHeader(headers["x-aws-secret-access-key"]) || globalConfig.bedrock.secretAccessKey,

    openAiApiKey: getHeader(headers["x-openai-api-key"]) || globalConfig.openai.apiKey,
    openAiApiAdminKey: getHeader(headers["x-openai-api-admin-key"]) || globalConfig.openai.adminApiKey,

    yandexFmApiKey: getHeader(headers["x-yandex-api-key"]) || globalConfig.yandex.fmApiKey,
    yandexFmApiFolder: getHeader(headers["x-yandex-api-folder"]) || globalConfig.yandex.fmApiFolder,
    yandexSearchApiKey:
      getHeader(headers["x-yandex-api-key"]) || globalConfig.yandex.searchApiKey || globalConfig.yandex.fmApiKey,
    yandexSearchApiFolder:
      getHeader(headers["x-yandex-api-folder"]) ||
      globalConfig.yandex.searchApiFolder ||
      globalConfig.yandex.fmApiFolder,
  };
}
