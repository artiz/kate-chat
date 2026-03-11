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

export interface ResetTokenPayload {
  userId: string;
  email: string;
  purpose: "reset_password";
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, runtime.jwtSecret, { expiresIn: runtime.jwtExpirationSec });
}

export function generateResetToken(payload: Omit<ResetTokenPayload, "purpose">): string {
  return jwt.sign({ ...payload, purpose: "reset_password" }, runtime.jwtResetPasswordSecret, { expiresIn: "15m" });
}

export function verifyResetToken(token: string): ResetTokenPayload {
  const payload = jwt.verify(token, runtime.jwtResetPasswordSecret) as ResetTokenPayload;
  if (payload.purpose !== "reset_password") throw new Error("Invalid token purpose");
  return payload;
}

export function verifyToken(token: string): TokenPayload | null {
  return jwt.verify(token, runtime.jwtSecret) as TokenPayload;
}

export function checkTokenWithoutExpiration(token: string): TokenPayload | null {
  return jwt.verify(token, runtime.jwtSecret, { ignoreExpiration: true }) as TokenPayload;
}

export function isAdmin(token?: TokenPayload): boolean {
  return token?.roles?.includes(UserRole.ADMIN) || false;
}
