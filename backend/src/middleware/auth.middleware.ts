import { Request, Response, NextFunction } from "express";
import { verifyToken, TokenPayload } from "../utils/jwt";
import { PubSubEngine } from "graphql-subscriptions";
import { logger } from "../utils/logger";

export interface ConnectionParams {
  AWS_REGION?: string;
  AWS_PROFILE?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_API_ADMIN_KEY?: string;
  YANDEX_API_KEY?: string;
  YANDEX_API_FOLDER_ID?: string;
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
          req.connectionParams = {
            AWS_REGION: getHeader(req.headers["x-aws-region"]),
            AWS_PROFILE: getHeader(req.headers["x-aws-profile"]),
            AWS_ACCESS_KEY_ID: getHeader(req.headers["x-aws-access-key-id"]),
            AWS_SECRET_ACCESS_KEY: getHeader(req.headers["x-aws-secret-access-key"]),
            OPENAI_API_KEY: getHeader(req.headers["x-openai-api-key"]),
            OPENAI_API_ADMIN_KEY: getHeader(req.headers["x-openai-api-admin-key"]),
            YANDEX_API_KEY: getHeader(req.headers["x-yandex-api-key"]),
            YANDEX_API_FOLDER_ID: getHeader(req.headers["x-yandex-api-folder-id"]),
          };
        }
      }
    }

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
