import { Request, Response, NextFunction } from "express";
import { verifyToken, TokenPayload } from "../utils/jwt";
import { logger } from "../utils/logger";
import { IncomingHttpHeaders } from "http";

export interface ConnectionParams {
  AWS_BEDROCK_REGION?: string;
  AWS_BEDROCK_PROFILE?: string;
  AWS_BEDROCK_ACCESS_KEY_ID?: string;
  AWS_BEDROCK_SECRET_ACCESS_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_API_ADMIN_KEY?: string;
  YANDEX_FM_API_KEY?: string;
  YANDEX_FM_API_FOLDER_ID?: string;
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_FILES_BUCKET_NAME?: string;
}

declare global {
  namespace Express {
    interface Request {
      tokenPayload?: TokenPayload;
      connectionParams?: ConnectionParams;
    }
  }
}

export type GraphQLContext = {
  tokenPayload?: TokenPayload;
  connectionParams: ConnectionParams;
};

// GraphQL context authentication
export const getUserFromToken = (authHeader?: string): TokenPayload | null => {
  if (!authHeader) return null;

  // Handle both "Bearer token" format and direct token
  const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;

  if (!token) return null;

  try {
    return verifyToken(token);
  } catch (error) {
    logger.error({ error }, "Error verifying token");
    return null;
  }
};

export const graphQlAuthChecker = ({ context }: { context: GraphQLContext }, roles: string[]): boolean => {
  const user = context.tokenPayload;
  if (!user) return false;
  if (roles.length === 0) return true;

  return false;
};

// Export the middleware
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader) {
      const token = authHeader.split(" ")[1];
      if (token) {
        const tokenPayload = verifyToken(token);
        if (!tokenPayload) {
          logger.warn("Invalid or expired token");
          res.status(403).json({ error: "Forbidden: Invalid or expired token" });
        } else {
          req.tokenPayload = tokenPayload;
        }
      }
    }

    req.connectionParams = loadConnectionParams(req.headers);
    next();
  } catch (error) {
    logger.error(error, "Auth middleware error, path: %s", req.path);
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
    AWS_BEDROCK_REGION: getHeader(headers["x-aws-region"]) || process.env.AWS_BEDROCK_REGION || "eu-central-1",
    AWS_BEDROCK_PROFILE: getHeader(headers["x-aws-profile"]) || process.env.AWS_BEDROCK_PROFILE,
    AWS_BEDROCK_ACCESS_KEY_ID: getHeader(headers["x-aws-access-key-id"]) || process.env.AWS_BEDROCK_ACCESS_KEY_ID,
    AWS_BEDROCK_SECRET_ACCESS_KEY:
      getHeader(headers["x-aws-secret-access-key"]) || process.env.AWS_BEDROCK_SECRET_ACCESS_KEY,
    OPENAI_API_KEY: getHeader(headers["x-openai-api-key"]) || process.env.OPENAI_API_KEY,
    OPENAI_API_ADMIN_KEY: getHeader(headers["x-openai-api-admin-key"]) || process.env.OPENAI_API_ADMIN_KEY,
    YANDEX_FM_API_KEY: getHeader(headers["x-yandex-api-key"]) || process.env.YANDEX_FM_API_KEY,
    YANDEX_FM_API_FOLDER_ID: getHeader(headers["x-yandex-api-folder-id"]) || process.env.YANDEX_FM_API_FOLDER_ID,

    S3_ENDPOINT: getHeader(headers["x-s3-endpoint"]) || process.env.S3_ENDPOINT,
    S3_REGION: getHeader(headers["x-s3-region"]) || process.env.S3_REGION || "us-east-1",
    S3_ACCESS_KEY_ID: getHeader(headers["x-s3-access-key-id"]) || process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: getHeader(headers["x-s3-secret-access-key"]) || process.env.S3_SECRET_ACCESS_KEY,
    S3_FILES_BUCKET_NAME: getHeader(headers["x-s3-bucket-name"]) || process.env.S3_FILES_BUCKET_NAME,
  };
}
