import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import { generateToken, TokenPayload, verifyToken } from "@/utils/jwt";
import { User, MCPServer } from "@/entities";
import { getRepository } from "@/config/database";
import { createLogger } from "@/utils/logger";
import { MCP_OAUTH_ERROR_TEMPLATE, MCP_OAUTH_SUCCESS_TEMPLATE } from "./html.templates";
import { escapeHtml } from "@/utils/format";
import { globalConfig } from "@/global-config";

const logger = createLogger(__filename);
const runtimeCfg = globalConfig.config.runtime;

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
  res.redirect(`${runtimeCfg.frontendUrl}/oauth-callback?token=${token}`);
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

// Microsoft OAuth routes
router.get("/microsoft", passport.authenticate("microsoft"));

router.get(
  "/microsoft/callback",
  passport.authenticate("microsoft", { failureRedirect: "/login", session: false }),
  handleAuthResponse
);

// MCP OAuth callback - exchanges authorization code for access token and returns HTML that writes token to localStorage
router.get("/mcp/callback", async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    logger.warn({ error, error_description }, "MCP OAuth error");
    const errorHtml = MCP_OAUTH_ERROR_TEMPLATE.replace(
      /\{\{ERROR_DESCRIPTION\}\}/g,
      escapeHtml(error_description || error || "Unknown error").replace(/\{\{ERROR\}\}/g, escapeHtml(error))
    );
    res.status(400).send(errorHtml);
    return;
  }

  if (!code || !state) {
    const errorHtml = MCP_OAUTH_ERROR_TEMPLATE.replace(
      /\{\{ERROR_DESCRIPTION\}\}/g,
      "Missing authorization code or state".replace(/\{\{ERROR\}\}/g, "missing_code_or_state")
    );
    res.status(400).send(errorHtml);
    return;
  }

  logger.debug({ code, state }, "MCP OAuth callback received with code and state");

  const [serverId, userToken] = String(state).split("@");
  let tokenPayload: TokenPayload | null = null;
  try {
    tokenPayload = verifyToken(userToken || "");
  } catch (error) {
    logger.warn({ error }, "Invalid user token in MCP OAuth state");
    const errorHtml = MCP_OAUTH_ERROR_TEMPLATE.replace(
      /\{\{ERROR_DESCRIPTION\}\}/g,
      "Invalid or expired user token".replace(/\{\{ERROR\}\}/g, "invalid_or_expired_user_token")
    );
    res.status(400).send(errorHtml);
    return;
  }

  try {
    // Look up the MCP server to get OAuth config
    const mcpServerRepository = getRepository(MCPServer);
    const server = await mcpServerRepository.findOne({
      where: { id: serverId, isActive: true, userId: tokenPayload?.userId },
    });

    if (!server) {
      logger.error({ serverId }, "MCP server not found for OAuth callback");
      const errorHtml = MCP_OAUTH_ERROR_TEMPLATE.replace(/\{\{ERROR_DESCRIPTION\}\}/g, "MCP server not found").replace(
        /\{\{ERROR\}\}/g,
        "server_not_found"
      );
      res.status(404).send(errorHtml);
      return;
    }

    const { authConfig } = server;
    if (!authConfig?.tokenUrl || !authConfig?.clientId) {
      logger.error({ serverId }, "MCP server OAuth config incomplete - missing tokenUrl or clientId");
      const errorHtml = MCP_OAUTH_ERROR_TEMPLATE.replace(
        /\{\{ERROR_DESCRIPTION\}\}/g,
        "OAuth configuration incomplete - missing tokenUrl or clientId"
      ).replace(/\{\{ERROR\}\}/g, "config_incomplete");

      res.status(400).send(errorHtml);
      return;
    }

    // Exchange authorization code for access token
    const redirectUri = `${runtimeCfg.callbackUrlBase}/auth/mcp/callback`;

    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: redirectUri,
      client_id: authConfig.clientId,
      ...(authConfig.clientSecret && { client_secret: authConfig.clientSecret }),
    });

    logger.debug({ tokenUrl: authConfig.tokenUrl, serverId }, "Exchanging code for token");

    const tokenResponse = await fetch(authConfig.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error({ status: tokenResponse.status, error: errorText, serverId }, "Token exchange failed");
      const errorHtml = MCP_OAUTH_ERROR_TEMPLATE.replace(
        /\{\{ERROR_DESCRIPTION\}\}/g,
        `Token exchange failed: ${escapeHtml(tokenResponse.status)}`
      ).replace(/\{\{ERROR\}\}/g, "token_exchange_failed");
      res.status(400).send(errorHtml);
      return;
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in; // seconds

    if (!accessToken) {
      logger.error({ serverId, tokenData }, "No access_token in token response");
      const errorHtml = MCP_OAUTH_ERROR_TEMPLATE.replace(
        /\{\{ERROR_DESCRIPTION\}\}/g,
        "No access token received"
      ).replace(/\{\{ERROR\}\}/g, "no_access_token");
      res.status(400).send(errorHtml);
      return;
    }

    // Calculate expiration timestamp
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : undefined;

    logger.debug({ serverId, hasRefreshToken: !!refreshToken, expiresIn }, "Token exchange successful");

    // Return HTML that stores the access token and notifies parent window
    const successHtml = MCP_OAUTH_SUCCESS_TEMPLATE.replace(/\{\{SERVER_ID\}\}/g, escapeHtml(serverId))
      .replace(/\{\{SERVER_NAME\}\}/g, escapeHtml(server.name))
      .replace(/\{\{ACCESS_TOKEN\}\}/g, escapeHtml(accessToken))
      .replace(/\{\{REFRESH_TOKEN\}\}/g, escapeHtml(refreshToken || ""))
      .replace(/\{\{EXPIRES_AT\}\}/g, expiresAt ? escapeHtml(expiresAt) : "");
    res.send(successHtml);
  } catch (err) {
    logger.error(err, "Error during MCP OAuth token exchange");
    const errorHtml = MCP_OAUTH_ERROR_TEMPLATE.replace(
      /\{\{ERROR_DESCRIPTION\}\}/g,
      "Server error during token exchange"
    ).replace(/\{\{ERROR\}\}/g, "server_error");
    res.status(500).send(errorHtml);
  }
});
