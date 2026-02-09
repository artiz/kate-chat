import React, { useState, useEffect, useCallback } from "react";
import { Modal, TextInput, Button, Group, Stack, Text } from "@mantine/core";
import { APP_API_URL } from "@/lib/config";
import { ChatTool, MCPServer, ToolType } from "@/types/graphql";
import { assert } from "@katechat/ui";
import { User } from "@/store/slices/userSlice";

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

export const getChatMcpTokens = (tools?: ChatTool[]): McpTokenInfo[] | undefined => {
  if (!tools) return undefined;

  return tools
    .filter(tool => tool.type === ToolType.MCP && tool.id)
    .map(tool => {
      const token = getMcpAuthToken(tool.id!);
      return token ? { serverId: tool.id!, ...token } : null;
    })
    .filter(assert.notEmpty);
};

const ACCESS_TOKEN_KEY = (serverId: string) => `mcp.${serverId}.access_token`;
const REFRESH_TOKEN_KEY = (serverId: string) => `mcp.${serverId}.refresh_token`;
const EXPIRES_AT_KEY = (serverId: string) => `mcp.${serverId}.expires_at`;
const TOKEN_EXPIRATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check if user has a valid token for an MCP server
 */
export const hasValidMcpToken = (serverId: string): boolean => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY(serverId));
  const expiresAt = localStorage.getItem(EXPIRES_AT_KEY(serverId));

  if (!token) return false;
  if (expiresAt && Date.now() >= parseInt(expiresAt, 10)) return false;
  return true;
};

/**
 * Get MCP auth token from localStorage
 */
export const getMcpAuthToken = (
  serverId: string
): { accessToken: string; refreshToken?: string; expiresAt?: number } | null => {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY(serverId));
  if (!accessToken) return null;

  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY(serverId)) || undefined;
  const expiresAtStr = localStorage.getItem(EXPIRES_AT_KEY(serverId));
  const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : undefined;

  return { accessToken, refreshToken, expiresAt };
};

/**
 * Store MCP token in localStorage
 */
export const storeMcpToken = (serverId: string, token: string, expiresAt?: number): void => {
  localStorage.setItem(ACCESS_TOKEN_KEY(serverId), token);
  localStorage.setItem(
    EXPIRES_AT_KEY(serverId),
    expiresAt ? expiresAt.toString() : (Date.now() + TOKEN_EXPIRATION_MS).toString()
  );
};

/**
 * Initiate OAuth flow for an MCP server
 */
export const initiateMcpOAuth = (server: MCPServer, userToken: string): boolean => {
  if (!server.authConfig?.authorizationUrl || !server.authConfig?.clientId) {
    console.error("MCP server OAuth config is incomplete", server);
    return false;
  }

  const redirectUri = `${APP_API_URL}/auth/mcp/callback`;
  const params = new URLSearchParams({
    client_id: server.authConfig.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state: `${server.id}@${userToken}`,
    nonce: crypto.randomUUID().replace(/-/g, ""), // simple nonce for CSRF protection
    scope: server.authConfig.scope || "",
  });

  const authUrl = `${server.authConfig.authorizationUrl}?${params.toString()}`;

  // Open OAuth popup
  const popup = window.open(authUrl, "mcp_oauth", "width=600,height=700,popup=1");
  if (!popup) {
    console.error("Failed to open OAuth popup - please allow popups for this site");
    return false;
  }
  return true;
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
  mcpInitiateAuth: (server: MCPServer, userToken: string, force?: boolean) => boolean;
}

export const useMcpAuth = (servers: MCPServer[], chatId?: string): UseMcpAuthResult => {
  const [mcpAuthStatus, setAuthStatus] = useState<Map<string, boolean>>(new Map());
  const [mcpTokenModalServer, setTokenModalServer] = useState<MCPServer | null>(null);
  const [mcpTokenValue, mcpSetTokenValue] = useState("");

  // Check auth status for all servers
  useEffect(() => {
    const statusMap = new Map<string, boolean>();
    servers.forEach(server => {
      if (requiresAuth(server)) {
        statusMap.set(server.id, hasValidMcpToken(server.id));
      }
    });
    setAuthStatus(statusMap);
  }, [servers, chatId]);

  // Listen for OAuth callback messages from popup
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === "mcp-oauth-callback") {
        const { serverId, accessToken, expiresAt } = event.data;

        // The server has already exchanged the code for a token and stored it in localStorage
        // Just update the auth status
        if (accessToken) {
          // Token was also sent via postMessage, ensure it's stored
          localStorage.setItem(ACCESS_TOKEN_KEY(serverId), accessToken);
          // expire in 1h if not provided
          localStorage.setItem(
            EXPIRES_AT_KEY(serverId),
            expiresAt ? String(expiresAt) : String(Date.now() + TOKEN_EXPIRATION_MS)
          );
        }

        // Update auth status
        setAuthStatus(prev => new Map(prev).set(serverId, true));
      } else if (event.data?.type === "mcp-oauth-error") {
        console.error("MCP OAuth error", event.data.error);
      }
    };

    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, []);

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

    // Close modal
    setTokenModalServer(null);
    mcpSetTokenValue("");

    return true;
  }, [mcpTokenModalServer, mcpTokenValue]);

  const mcpInitiateAuth = useCallback(
    (server: MCPServer, userToken: string, force: boolean = false): boolean => {
      // If OAuth is required, initiate OAuth flow
      if (requiresOAuth(server) && (force || !hasValidMcpToken(server.id))) {
        return initiateMcpOAuth(server, userToken);
      }

      // If API Key or Bearer token is required, show token entry dialog
      if (requiresTokenEntry(server) && (force || !hasValidMcpToken(server.id))) {
        mcpOpenTokenModal(server);
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
