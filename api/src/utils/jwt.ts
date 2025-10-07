import jwt from "jsonwebtoken";
import { UserRole } from "@/entities";

const JWT_SECRET = process.env.JWT_SECRET || "";
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || "7200"; // 2 hour in seconds

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}

export interface TokenPayload {
  userId: string;
  email: string;
  roles?: string[]; // Optional roles for the user
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: parseInt(JWT_EXPIRATION, 10) });
}

export function verifyToken(token: string): TokenPayload | null {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function isAdmin(token?: TokenPayload): boolean {
  return token?.roles?.includes(UserRole.ADMIN) || false;
}
