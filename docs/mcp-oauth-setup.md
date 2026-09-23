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
  createMcpServer(input: {
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

## System MCP Servers (Built-in)

Kate-Chat can host built-in MCP servers inside the API process, available at `CALLBACK_URL_BASE/mcp/<name>`. These are registered as **System** MCP servers (visible to all users) and require provider-specific OAuth to access user data, or for Telegram, which has no OAuth, a sign-in by phone inside the app.

### Enabling System MCP Servers

Add an `ai.enabledMcp` array to your `customization.json`:

```json
{
  "ai": {
    "enabledMcp": ["gmail", "teams"]
  }
}
```

Set the corresponding environment variables (pattern: `MCP_SERVER_<NAME>_CLIENT_ID` / `MCP_SERVER_<NAME>_CLIENT_SECRET`):
```
MCP_SERVER_GMAIL_CLIENT_ID=your-google-client-id
MCP_SERVER_GMAIL_CLIENT_SECRET=your-google-client-secret
MCP_SERVER_MICROSOFT_TEAMS_CLIENT_ID=your-azure-ad-client-id
MCP_SERVER_MICROSOFT_TEAMS_CLIENT_SECRET=your-azure-ad-client-secret
```

Alternatively, configure via the `ENABLED_MCP_SERVICES` environment variable (comma-separated list):
```
ENABLED_MCP_SERVICES=gmail,teams
```

On startup, Kate-Chat will:
1. Register the system MCP server at `/mcp/gmail`
2. Create a `System`-access MCP server record in the database with the OAuth2 configuration

Users then see the system MCP servers in MCP settings and can authorize them via the standard OAuth2 popup flow.

---

### Gmail MCP Server

Provides tools to read, search, and send emails via the Gmail API.

**Available tools:**
| Tool | Description |
|------|-------------|
| `list_emails` | List emails from inbox (or any label) |
| `get_email` | Get full email content by message ID |
| `search_emails` | Search using Gmail search syntax |
| `send_email` | Send an email |
| `create_draft` | Create a draft email |
| `list_labels` | List all Gmail labels |

**Prerequisites:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project
2. Enable the **Gmail API** for the project
3. Create OAuth 2.0 credentials (type: **Web application**)
4. Add an authorized redirect URI:
   ```
   https://your-domain.com/auth/mcp/callback
   ```
5. Copy the **Client ID** and **Client Secret** to your environment variables

**Required OAuth scopes** (requested automatically during user authorization):
```
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.compose
```

**Authentication flow:**
1. Admin enables Gmail MCP in `customization.json` with Google OAuth credentials
2. The system Gmail MCP server is registered at `CALLBACK_URL_BASE/mcp/gmail`
3. Users open Admin > MCP Servers and see the system **Gmail** server
4. Clicking **Authorize** opens a Google OAuth popup
5. After authorization, the Google access token is stored and used automatically

---

### Microsoft Teams MCP Server

Provides tools to manage chats, channels, messages, and teams via the Microsoft Graph API.

**Available tools:**
| Tool | Description |
|------|-------------|
| `list_chats` | List the user's Teams chats |
| `get_chat` | Get a specific chat by ID |
| `list_chat_messages` | List messages in a chat |
| `post_chat_message` | Send a message to a chat |
| `create_chat` | Create a new one-on-one or group chat |
| `list_chat_members` | List members of a chat |
| `list_teams` | List joined teams |
| `get_team` | Get team details |
| `list_channels` | List channels in a team |
| `list_channel_messages` | List messages in a channel |
| `post_channel_message` | Post a message to a channel |
| `reply_to_channel_message` | Reply to a channel message |
| `list_channel_members` | List members of a channel |

**Prerequisites:**

1. Go to [Microsoft Entra admin center](https://entra.microsoft.com/) (Azure AD)
2. Navigate to **App registrations** and create a new registration
3. Under **Authentication**, add a Web redirect URI:
   ```
   https://your-domain.com/auth/mcp/callback
   ```
4. Under **API permissions**, add the following **Microsoft Graph** delegated permissions:
   - `User.Read`
   - `Chat.ReadWrite`
   - `ChannelMessage.Read.All`
   - `ChannelMessage.Send`
   - `Team.ReadBasic.All`
   - `Channel.ReadBasic.All`
   - `ChatMember.Read`

   > **Important:** Use **Delegated** permissions, not Application. The OAuth authorization code flow operates in the signed-in user's context.
5. Grant admin consent for the permissions (or let users consent individually if allowed)
6. Under **Certificates & secrets**, create a new client secret
7. Copy the **Application (client) ID** and **Client secret** to your environment variables:
   ```
   MCP_SERVER_MICROSOFT_TEAMS_CLIENT_ID=your-azure-ad-application-client-id
   MCP_SERVER_MICROSOFT_TEAMS_CLIENT_SECRET=your-azure-ad-client-secret
   ```

> **Note:** The default configuration uses `/common/` endpoints, which allow both personal Microsoft accounts and work/school (Azure AD) accounts to sign in. If you want to restrict to a single tenant, replace `common` in the OAuth URLs with your specific tenant ID.

**Required OAuth scopes** (requested automatically during user authorization):
```
https://graph.microsoft.com/Chat.ReadWrite
https://graph.microsoft.com/Channel.ReadBasic.All
https://graph.microsoft.com/ChannelMessage.Read.All
https://graph.microsoft.com/ChannelMessage.Send
https://graph.microsoft.com/Team.ReadBasic.All
https://graph.microsoft.com/TeamMember.Read.All
https://graph.microsoft.com/User.Read
offline_access
```

Each scope is listed explicitly so users can consent individually — no admin consent is required. The `offline_access` scope enables refresh tokens. Ensure matching **Delegated** permissions are added in the Entra ID app registration.

**Authentication flow:**
1. Admin enables Teams MCP in `customization.json` with Azure AD OAuth credentials
2. The system Teams MCP server is registered at `CALLBACK_URL_BASE/mcp/teams`
3. Users open Admin > MCP Servers and see the system **Microsoft Teams** server
4. Clicking **Authorize** opens a Microsoft OAuth popup
5. After authorization, the Microsoft access token is stored and used automatically

**References:**
- [Microsoft Teams MCP Server (InditexTech)](https://github.com/InditexTech/mcp-teams-server) — standalone Python-based Teams MCP server
- [Microsoft Teams MCP Server Reference](https://learn.microsoft.com/en-us/microsoft-agent-365/mcp-server-reference/teams) — official Microsoft Graph operations reference

---

### Telegram MCP Server

Acts as the user's own Telegram account through MTProto ([GramJS](https://gram.js.org/)), the way the Gmail server acts as their mailbox. It is not a bot: the model sees the user's chats and sends as them.

**Available tools:**
| Tool | Description |
|------|-------------|
| `list_chats` | List chats, groups, channels and bots, most recent first, with unread counts; filter by name or to unread only |
| `get_messages` | Read one chat, oldest first; search within it or page back from a message ID |
| `search_messages` | Search messages across all chats |
| `send_message` | Send a plain-text message, optionally as a reply |
| `mark_as_read` | Mark a chat as read |

A chat can be named by the ID `list_chats` returns, an `@username`, a phone number, or its title.

**Prerequisites:**

1. Sign in at [my.telegram.org](https://my.telegram.org) and open **API development tools**
2. Create an application; any title and platform will do
3. Copy **api_id** and **api_hash** to your environment variables, and add `telegram` to the enabled services:
   ```
   ENABLED_MCP_SERVICES=gmail,telegram
   MCP_SERVER_TELEGRAM_API_ID=1234567
   MCP_SERVER_TELEGRAM_API_HASH=0123456789abcdef0123456789abcdef
   ```

One application serves every user of the instance, like one OAuth client serves Gmail.

**Authentication flow:**

Telegram has no OAuth, so the system server is registered with the `TELEGRAM` authentication type and signs in inside the app:
1. The user enables **Telegram** in a chat's MCP menu, or authenticates it in MCP settings
2. The dialog asks for the phone number; Telegram sends a code to the account's apps (or by SMS)
3. The user enters the code, then the cloud password if two-step verification is on
4. The resulting session string becomes the server's token: stored in the browser like other MCP tokens and sent with each request

The login steps run at `CALLBACK_URL_BASE/mcp/telegram/auth/{send-code,sign-in,password}`, require a KateChat login, and keep nothing between steps: each response hands the session back to resume from.

**Security:**
- The session is the whole account, with no scopes and no expiry. It is kept only in the user's browser and ends when the user terminates it in Telegram (**Settings → Devices**); after that the tools report that Telegram has to be connected again.
- The session never goes to a model provider. With OpenAI's native MCP support, other servers are handed to OpenAI with their token; Telegram is always called by the API itself.
- The API keeps a connected client per session for ten idle minutes, in memory only.

**References:**
- [dryeab/mcp-telegram](https://github.com/dryeab/mcp-telegram) — standalone Python (Telethon) MCP server acting as a user account

---

## Supported External MCP Servers

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
