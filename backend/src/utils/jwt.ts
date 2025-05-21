import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-jwt-secret";
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || "86400"; // 24 hours in seconds

export interface TokenPayload {
  userId: string;
  email: string;
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: parseInt(JWT_EXPIRATION, 10) });
}

export function verifyToken(token: string): TokenPayload | null {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}
