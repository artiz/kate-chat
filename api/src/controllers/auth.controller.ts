import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import { generateToken } from "../utils/jwt";
import { User } from "../entities/User";
import { FRONTEND_URL } from "@/config/application";
import { createLogger } from "@/utils/logger";

const logger = createLogger(__filename);

// Create a router for auth routes
export const router = Router();

// Helper function to handle authentication and token generation
const handleAuthResponse = (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication failed" });
    return;
  }

  const user = req.user as User;

  // Generate JWT token
  logger.debug({ email: user.email, role: user.role }, "OAuth User authenticated successfully");
  const token = generateToken({
    userId: user.id,
    email: user.email,
    roles: [user.role],
  });

  // Redirect to the frontend with the token
  res.redirect(`${FRONTEND_URL}/oauth-callback?token=${token}`);
};

// Google OAuth routes
router.get("/google", passport.authenticate("google", { scope: ["openid", "profile", "email"] }));

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login", session: false }),
  handleAuthResponse
);

// GitHub OAuth routes
router.get("/github", passport.authenticate("github", { scope: ["user:email"] }));

router.get(
  "/github/callback",
  passport.authenticate("github", { failureRedirect: "/login", session: false }),
  handleAuthResponse
);
