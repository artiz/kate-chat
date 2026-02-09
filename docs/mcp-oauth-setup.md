# OAuth-Authorized MCP Server Setup

This guide explains how to configure and connect OAuth-authorized MCP servers like GitHub Copilot MCP.

## Overview

Some MCP servers require OAuth authentication to access user-specific resources. For example, the GitHub Copilot MCP server requires a GitHub OAuth token to access the user's Copilot subscription.

Kate-Chat supports OAuth 2.0 Authorization Code flow for MCP servers, where:
1. The user initiates authentication from the chat interface
2. A popup window opens for the OAuth provider's login
3. After successful authentication, the token is stored in localStorage
4. The token is automatically sent with MCP tool calls

## Configuring an OAuth MCP Server

### 1. Create the MCP Server in Admin Settings

Navigate to Admin > MCP Servers and create a new server with:

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | Display name for the server | `GitHub Copilot` |
| **URL** | MCP server endpoint | `https://api.githubcopilot.com/mcp` |
| **Transport Type** | Usually `STREAMABLE_HTTP` | `STREAMABLE_HTTP` |
| **Auth Type** | Set to `OAUTH2` | `OAUTH2` |
| **Is Active** | Enable the server | `true` |

### 2. Configure OAuth Authentication

In the Auth Config section:

| Field | Description | Example |
|-------|-------------|---------|
| **Client ID** | OAuth application client ID | `Iv1.abc123...` |
| **Client Secret** | OAuth application client secret (optional for PKCE) | `secret...` |
| **Authorization URL** | OAuth authorization endpoint | `https://github.com/login/oauth/authorize` |
| **Token URL** | OAuth token exchange endpoint | `https://github.com/login/oauth/access_token` |
| **Scope** | OAuth scopes to request | `read:user copilot` |
| **Requires User Auth** | Set to `true` for user-specific auth | `true` |

### 3. GraphQL Input Example

```graphql
mutation CreateMCPServer {
  createMCPServer(input: {
    name: "GitHub Copilot"
    url: "https://api.githubcopilot.com/mcp"
    transportType: STREAMABLE_HTTP
    authType: OAUTH2
    authConfig: {
      clientId: "Iv1.abc123..."
      authorizationUrl: "https://github.com/login/oauth/authorize"
      scope: "read:user copilot"
    }
    isActive: true
  }) {
    id
    name
  }
}
```

## User Authentication Flow

When a user selects an OAuth-protected MCP server:

1. **Lock Icon**: Servers requiring authentication show a 🔒 icon
2. **OAuth Popup**: Clicking the server opens an OAuth authorization popup
3. **Authorization**: User logs in with the OAuth provider
4. **Callback**: The popup receives the authorization code
5. **Token Storage**: The auth code is stored in localStorage
6. **Auto-send**: Tokens are automatically included in message requests

## Token Storage

OAuth tokens are stored in browser localStorage with keys:
- `mcp.<server_id>.access_token` - Access token for API calls
- `mcp.<server_id>.refresh_token` - Refresh token (if provided)
- `mcp.<server_id>.expires_at` - Token expiration timestamp

## Security Considerations

1. **Client-side Storage**: Tokens are stored in localStorage and sent to the server with each message request
2. **Token Scope**: Request minimal necessary scopes
3. **Token Expiration**: Tokens should have reasonable expiration times
4. **HTTPS Required**: Always use HTTPS for MCP server endpoints

## Supported MCP Servers

### GitHub Copilot MCP

GitHub's official MCP server for Copilot capabilities.

**Configuration:**
```json
{
  "name": "GitHub Copilot",
  "url": "https://api.githubcopilot.com/mcp",
  "transportType": "STREAMABLE_HTTP",
  "authType": "OAUTH2",
  "authConfig": {
    "clientId": "<your-github-oauth-app-client-id>",
    "authorizationUrl": "https://github.com/login/oauth/authorize",
    "tokenUrl": "https://github.com/login/oauth/access_token",
    "scope": "read:user"
  }
}
```

**Prerequisites:**
1. Create a GitHub OAuth App at https://github.com/settings/developers
2. Set the callback URL to: `https://your-domain.com/auth/mcp/callback`
3. Copy the Client ID to the MCP server configuration

### Other OAuth MCP Servers

Any MCP server that supports OAuth 2.0 Authorization Code flow can be configured similarly. Contact the MCP server provider for:
- OAuth Client ID/Secret
- Authorization URL
- Token URL
- Required scopes

## Troubleshooting

### "Requires authentication" persists after login
- Check browser console for OAuth errors
- Verify the redirect URI matches your configuration
- Ensure popups are allowed for your site

### Token expired errors
- Tokens may need to be refreshed
- Clear localStorage and re-authenticate

### MCP server returns 401/403
- Verify the OAuth scopes are correct
- Check if the token has been revoked
- Re-authenticate with the server

## API Changes

The following API changes support OAuth MCP:

### CreateMessageInput
```graphql
input MCPAuthTokenInput {
  serverId: String!
  accessToken: String!
  refreshToken: String
  expiresAt: Float
}

input CreateMessageInput {
  chatId: String!
  content: String!
  images: [ImageInput!]
  documentIds: [String!]
  mcpTokens: [MCPAuthTokenInput!]  # NEW
}
```

### MCPAuthConfig
```graphql
type MCPAuthConfig {
  # ... existing fields
  authorizationUrl: String      # NEW
  scope: String                 # NEW  
}
```
