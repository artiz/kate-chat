import { Request, Response, NextFunction } from "express";
import { verifyToken, TokenPayload } from "../utils/jwt";
import { PubSubEngine } from "graphql-subscriptions";
import { logger } from "../utils/logger";

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export type GraphQLContext = {
  user?: TokenPayload;
  pubSub?: PubSubEngine;
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
  const user = context.user;
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
        const user = verifyToken(token);
        if (!user) {
          logger.warn("Invalid or expired token");
          res.status(403).json({ error: "Forbidden: Invalid or expired token" });
        } else {
          req.user = user;
        }
      }
    }

    next();
  } catch (error) {
    logger.error(error, "Auth middleware error, path: %s", req.path);
    next();
  }
};
