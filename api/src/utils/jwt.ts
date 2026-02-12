import jwt from "jsonwebtoken";
import { UserRole } from "@/entities";
import { globalConfig } from "@/global-config";

const runtime = globalConfig.runtime;

if (!runtime.jwtSecret) {
  throw new Error("JWT_SECRET environment variable is not set");
}

export interface TokenPayload {
  userId: string;
  email: string;
  roles?: string[]; // Optional roles for the user
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, runtime.jwtSecret, { expiresIn: runtime.jwtExpirationSec });
}

export function verifyToken(token: string): TokenPayload | null {
  return jwt.verify(token, runtime.jwtSecret) as TokenPayload;
}

export function isAdmin(token?: TokenPayload): boolean {
  return token?.roles?.includes(UserRole.ADMIN) || false;
}
