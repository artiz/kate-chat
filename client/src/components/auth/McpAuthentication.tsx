import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Modal, TextInput, Button, Group, Stack, Text } from "@mantine/core";
import { APP_API_URL } from "@/lib/config";
import { ChatTool, MCPServer, ToolType } from "@/types/graphql";
import { assert } from "@katechat/ui";
import { User } from "@/store/slices/userSlice";
import { notifications } from "@mantine/notifications";

export enum MCPAuthType {
  NONE = "NONE",
  API_KEY = "API_KEY",
  BEARER = "BEARER",
  OAUTH2 = "OAUTH2",
}

export interface McpTokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  serverId?: string;
}

/**
 * Check if MCP server requires OAuth flow
 */
export const requiresOAuth = (server: MCPServer): boolean => {
  return server.authType === MCPAuthType.OAUTH2;
};

/**
 * Check if MCP server requires API Key or Bearer token entry
 */
export const requiresTokenEntry = (server: MCPServer): boolean => {
  return server.authType === MCPAuthType.API_KEY || server.authType === MCPAuthType.BEARER;
};

/**
 * Check if MCP server requires any form of authentication
 */
export const requiresAuth = (server: MCPServer): boolean => {
  return requiresOAuth(server) || requiresTokenEntry(server);
};

export const getChatMcpTokens = (tools?: ChatTool[], userId?: string): McpTokenInfo[] | undefined => {
  if (!tools) return undefined;

  return tools
    .filter(tool => tool.type === ToolType.MCP && tool.id)
    .map(tool => {
      const token = getMcpAuthToken(tool.id!, userId);
      return token ? { serverId: tool.id!, ...token } : null;
    })
    .filter(assert.notEmpty);
};

const ACCESS_TOKEN_KEY = (serverId: string, userId: string | undefined) =>
  `${userId || "user"}-mcp.${serverId}.access_token`;
const REFRESH_TOKEN_KEY = (serverId: string, userId: string | undefined) =>
  `${userId || "user"}-mcp.${serverId}.refresh_token`;
const EXPIRES_AT_KEY = (serverId: string, userId: string | undefined) =>
  `${userId || "user"}-mcp.${serverId}.expires_at`;
const TOKEN_EXPIRATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check if user has a valid token for an MCP server
 */
export const hasValidMcpToken = (serverId: string, userId: string | undefined): boolean => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY(serverId, userId));
  const expiresAt = localStorage.getItem(EXPIRES_AT_KEY(serverId, userId));

  if (!token) return false;
  if (expiresAt && Date.now() >= parseInt(expiresAt, 10)) return false;
  return true;
};

/**
 * Get MCP auth token from localStorage
 */
export const getMcpAuthToken = (
  serverId: string,
  userId: string | undefined
): { accessToken: string; refreshToken?: string; expiresAt?: number } | null => {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY(serverId, userId));
  if (!accessToken) return null;

  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY(serverId, userId)) || undefined;
  const expiresAtStr = localStorage.getItem(EXPIRES_AT_KEY(serverId, userId));
  const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : undefined;

  return { accessToken, refreshToken, expiresAt };
};

/**
 * Store MCP token in localStorage
 */
export const storeMcpToken = (serverId: string, token: string, expiresAt?: number, userId?: string): void => {
  localStorage.setItem(ACCESS_TOKEN_KEY(serverId, userId), token);
  localStorage.setItem(
    EXPIRES_AT_KEY(serverId, userId),
    expiresAt ? expiresAt.toString() : (Date.now() + TOKEN_EXPIRATION_MS).toString()
  );
};

/**
 * Attempt to refresh an expired MCP token using the stored refresh_token.
 * Returns true if refresh succeeded and new token is stored.
 */
export const refreshMcpToken = async (
  serverId: string,
  userId: string | undefined,
  userToken: string
): Promise<boolean> => {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY(serverId, userId));
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${APP_API_URL}/auth/mcp/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ serverId, refreshToken }),
    });

    if (!response.ok) {
      localStorage.setItem(ACCESS_TOKEN_KEY(serverId, userId), "");
      localStorage.setItem(EXPIRES_AT_KEY(serverId, userId), "");
      return false;
    }

    const { accessToken, expiresAt, refreshToken: newRefreshToken } = await response.json();
    if (!accessToken) return false;

    localStorage.setItem(ACCESS_TOKEN_KEY(serverId, userId), accessToken);
    localStorage.setItem(
      EXPIRES_AT_KEY(serverId, userId),
      expiresAt ? String(expiresAt) : String(Date.now() + TOKEN_EXPIRATION_MS)
    );
    if (newRefreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY(serverId, userId), newRefreshToken);
    }
    return true;
  } catch {
    return false;
  }
};

/**
 * Initiate OAuth flow for an MCP server
 * Returns the popup window reference for origin validation
 */
export const initiateMcpOAuth = (server: MCPServer, userToken: string): Window | null => {
  if (!server.authConfig?.authorizationUrl || !server.authConfig?.clientId) {
    throw new Error("MCP server OAuth config is incomplete");
  }

  const redirectUri = `${APP_API_URL}/auth/mcp/callback`;
  const params = new URLSearchParams({
    client_id: server.authConfig.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state: `${server.id}@${userToken}`,
    nonce: crypto.randomUUID().replace(/-/g, ""), // simple nonce for CSRF protection
    scope: server.authConfig.scope || "",
    access_type: "offline", // request refresh token
    prompt: "consent", // force consent screen so refresh token is always returned
  });

  const authUrl = `${server.authConfig.authorizationUrl}?${params.toString()}`;

  // Open OAuth popup
  const popup = window.open(authUrl, "mcp_oauth", "width=600,height=700,popup=1");
  if (!popup) {
    console.error("Failed to open OAuth popup - please allow popups for this site");
    return null;
  }
  return popup;
};

/**
 * Hook to manage MCP authentication state
 */
export interface UseMcpAuthResult {
  /** Map of server ID -> authenticated status */
  mcpAuthStatus: Map<string, boolean>;
  /** Update auth status for a server */
  mcpUpdateAuthStatus: (serverId: string, isAuthenticated: boolean) => void;
  /** Check if server needs authentication */
  mcpNeedsAuthentication: (server: MCPServer) => boolean;
  /** Server for which token modal is open */
  mcpTokenModalServer: MCPServer | null;
  /** Current token input value */
  mcpTokenValue: string;
  /** Set token value */
  mcpSetTokenValue: (value: string) => void;
  /** Open token entry modal for a server */
  mcpOpenTokenModal: (server: MCPServer) => void;
  /** Close token modal */
  mcpCloseTokenModal: () => void;
  /** Submit token and store it */
  mcpSubmitToken: () => boolean;
  /** Initiate authentication for a server (OAuth or token modal) */
  mcpInitiateAuth: (server: MCPServer, userToken: string, force?: boolean, onAuthenticated?: () => void) => boolean;
}

export const useMcpAuth = (
  servers: MCPServer[],
  userId: string | undefined,
  chatId?: string,
  userToken?: string
): UseMcpAuthResult => {
  const [mcpAuthStatus, setAuthStatus] = useState<Map<string, boolean>>(new Map());
  const [mcpTokenModalServer, setTokenModalServer] = useState<MCPServer | null>(null);
  const [mcpTokenValue, mcpSetTokenValue] = useState("");

  // Track the OAuth popup window for source validation
  const oauthPopupRef = useRef<Window | null>(null);

  // Track whether we're actively expecting an OAuth callback
  const expectingOAuthCallback = useRef<() => void | null>(null);

  // Track known server IDs for validation
  const knownServerIds = useMemo(() => new Set(servers.map(s => s.id)), [servers]);

  // Get the expected origin for postMessage validation
  const expectedOrigin = useMemo(() => {
    // The API sends the callback, so we expect the origin to be window.origin (same origin)
    // or the API origin if it's different
    const apiUrl = APP_API_URL || window.location.origin;
    const url = new URL(apiUrl, window.location.origin);
    return url.origin;
  }, []);

  // Check auth status for all servers, auto-refreshing expired tokens when possible
  useEffect(() => {
    const check = async () => {
      const statusMap = new Map<string, boolean>();
      await Promise.all(
        servers
          .filter(server => requiresAuth(server))
          .map(async server => {
            if (hasValidMcpToken(server.id, userId)) {
              statusMap.set(server.id, true);
            } else if (userToken && localStorage.getItem(REFRESH_TOKEN_KEY(server.id, userId))) {
              const refreshed = await refreshMcpToken(server.id, userId, userToken);
              statusMap.set(server.id, refreshed);
            } else {
              statusMap.set(server.id, false);
            }
          })
      );
      setAuthStatus(statusMap);
    };
    check();
  }, [servers, chatId, userToken]);

  // Listen for OAuth callback messages from popup
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      // Security validation: Only accept messages when ALL criteria are met:
      // 1. We're actively expecting an OAuth callback (popup was opened)
      // 2. Origin must match expected API origin OR same-origin
      // 3. Source must be the popup window we opened

      if (!expectingOAuthCallback.current) {
        // Not expecting a callback - ignore all OAuth messages
        return;
      }

      const originValid = event.origin === expectedOrigin || event.origin === window.location.origin;

      if (!originValid) {
        return notifications.show({
          title: "Error",
          message: "MCP OAuth: Ignoring message from unexpected origin",
          color: "red",
        });
      }

      if (event.data?.type === "mcp-oauth-callback") {
        const sourceValid = oauthPopupRef.current && event.source === oauthPopupRef.current;
        if (!sourceValid) {
          return notifications.show({
            title: "Error",
            message: "MCP OAuth: Ignoring message from unexpected source",
            color: "red",
          });
        }

        const { serverId, accessToken, refreshToken, expiresAt } = event.data;

        // Validate serverId is known before storing tokens
        if (!knownServerIds.has(serverId)) {
          return notifications.show({
            title: "Error",
            message: "MCP OAuth: Ignoring callback for unknown server",
            color: "red",
          });
        }

        // The server has already exchanged the code for a token and stored it in localStorage
        // Just update the auth status
        if (accessToken) {
          // Token was also sent via postMessage, ensure it's stored
          localStorage.setItem(ACCESS_TOKEN_KEY(serverId, userId), accessToken);
          localStorage.setItem(REFRESH_TOKEN_KEY(serverId, userId), refreshToken);
          // expire in 1h if not provided
          localStorage.setItem(
            EXPIRES_AT_KEY(serverId, userId),
            expiresAt ? String(expiresAt) : String(Date.now() + TOKEN_EXPIRATION_MS)
          );

          expectingOAuthCallback.current();
        }

        // Update auth status
        setAuthStatus(prev => new Map(prev).set(serverId, true));

        // Clear the popup reference and expecting flag
        oauthPopupRef.current = null;
        expectingOAuthCallback.current = null;
      } else if (event.data?.type === "mcp-oauth-error") {
        notifications.show({
          title: "Error",
          message: `MCP OAuth Error: ${event.data.error || "Unknown error occurred during authentication"}`,
          color: "red",
        });

        oauthPopupRef.current = null;
        expectingOAuthCallback.current = null;
      }
    };

    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, [expectedOrigin, knownServerIds]);

  const mcpUpdateAuthStatus = useCallback((serverId: string, isAuthenticated: boolean) => {
    setAuthStatus(prev => new Map(prev).set(serverId, isAuthenticated));
  }, []);

  const mcpNeedsAuthentication = useCallback(
    (server: MCPServer): boolean => {
      if (!requiresAuth(server)) return false;
      return !mcpAuthStatus.get(server.id);
    },
    [mcpAuthStatus]
  );

  const mcpOpenTokenModal = useCallback((server: MCPServer) => {
    setTokenModalServer(server);
    mcpSetTokenValue("");
  }, []);

  const mcpCloseTokenModal = useCallback(() => {
    setTokenModalServer(null);
    mcpSetTokenValue("");
  }, []);

  const mcpSubmitToken = useCallback((): boolean => {
    if (!mcpTokenModalServer || !mcpTokenValue.trim()) return false;

    // Store the token in localStorage
    storeMcpToken(mcpTokenModalServer.id, mcpTokenValue.trim());

    // Update auth status
    setAuthStatus(prev => new Map(prev).set(mcpTokenModalServer.id, true));
    expectingOAuthCallback.current?.();

    // Close modal
    setTokenModalServer(null);
    mcpSetTokenValue("");

    return true;
  }, [mcpTokenModalServer, mcpTokenValue]);

  const mcpInitiateAuth = useCallback(
    (server: MCPServer, userToken: string, force: boolean = false, onAuthenticated?: () => void): boolean => {
      // If OAuth is required, initiate OAuth flow
      if (requiresOAuth(server) && (force || !hasValidMcpToken(server.id, userId))) {
        try {
          const popup = initiateMcpOAuth(server, userToken);
          if (popup) {
            oauthPopupRef.current = popup;
            expectingOAuthCallback.current = onAuthenticated || (() => {});
            return true;
          }
        } catch (error) {
          notifications.show({
            title: "Error",
            message: `Failed to initiate MCP OAuth flow: ${error instanceof Error ? error.message : "Unknown error"}`,
            color: "red",
          });
        }

        return false;
      }

      // If API Key or Bearer token is required, show token entry dialog
      if (requiresTokenEntry(server) && (force || !hasValidMcpToken(server.id, userId))) {
        mcpOpenTokenModal(server);
        expectingOAuthCallback.current = onAuthenticated || (() => {});
        return true;
      }

      // Already authenticated or no auth required
      return false;
    },
    [mcpOpenTokenModal]
  );

  return {
    mcpAuthStatus,
    mcpUpdateAuthStatus,
    mcpNeedsAuthentication: mcpNeedsAuthentication,
    mcpTokenModalServer: mcpTokenModalServer,
    mcpTokenValue: mcpTokenValue,
    mcpSetTokenValue: mcpSetTokenValue,
    mcpOpenTokenModal: mcpOpenTokenModal,
    mcpCloseTokenModal: mcpCloseTokenModal,
    mcpSubmitToken: mcpSubmitToken,
    mcpInitiateAuth: mcpInitiateAuth,
  };
};

/**
 * Token Entry Modal Component
 */
interface McpTokenModalProps {
  opened: boolean;
  server: MCPServer | null;
  tokenValue: string;
  onTokenChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export const McpTokenModal: React.FC<McpTokenModalProps> = ({
  opened,
  server,
  tokenValue,
  onTokenChange,
  onSubmit,
  onClose,
}) => {
  const isApiKey = server?.authType === MCPAuthType.API_KEY;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isApiKey ? `Enter API Key for ${server?.name}` : `Enter Bearer Token for ${server?.name}`}
      centered
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {isApiKey
            ? "This MCP server requires an API key for authentication. Enter your API key below."
            : "This MCP server requires a Bearer token for authentication. Enter your token below."}
        </Text>
        <TextInput
          label={isApiKey ? "API Key" : "Bearer Token"}
          placeholder={isApiKey ? "Your API key" : "Your bearer token"}
          type="password"
          value={tokenValue}
          onChange={e => onTokenChange(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSubmit()}
          autoFocus
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!tokenValue.trim()}>
            Submit
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
