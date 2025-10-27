# Setting up OAuth Authentication

KateChat supports authentication through Google, GitHub, and Microsoft OAuth providers. This document explains how to set up OAuth for these providers.

## Required Environment Variables

Add these variables to your `.env` file in the backend directory:

```
# OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_TENANT_ID=common
CALLBACK_URL_BASE=http://localhost:4000
FRONTEND_URL=http://localhost:3000
SESSION_SECRET=your_session_secret
```

## Google OAuth Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" and select "OAuth client ID"
5. Set up the OAuth consent screen if prompted:
   - Choose "External" user type (or "Internal" for development)
   - Fill in the required app information
   - Add the scopes for "email" and "profile"
   - Add test users if using "External" type
6. For the OAuth client ID:
   - Select "Web application" as the application type
   - Add a name for the client ID (e.g., "KateChat Web Client")
   - Add authorized JavaScript origins: `http://localhost:3000` (or your frontend URL)
   - Add authorized redirect URIs: `http://localhost:4000/api/auth/google/callback` (adjust based on your CALLBACK_URL_BASE)
7. Click "Create"
8. Copy the generated Client ID and Client Secret to your environment variables

## GitHub OAuth Setup

1. Go to your [GitHub Settings](https://github.com/settings/profile)
2. Click on "Developer settings" at the bottom of the left sidebar
3. Select "OAuth Apps" and click "New OAuth App"
4. Fill in the application details:
   - Application name: "KateChat" (or your preferred name)
   - Homepage URL: `http://localhost:3000` (or your frontend URL)
   - Application description: (optional)
   - Authorization callback URL: `http://localhost:4000/api/auth/github/callback` (adjust based on your CALLBACK_URL_BASE)
5. Click "Register application"
6. Generate a new client secret
7. Copy the Client ID and Client Secret to your environment variables

## Microsoft Azure OAuth Setup

1. Go to the [Azure Portal](https://portal.azure.com/)
2. Navigate to "Azure Active Directory" > "App registrations"
3. Click "New registration"
4. Fill in the application details:
   - Name: "KateChat" (or your preferred name)
   - Supported account types: Choose based on your needs:
     - "Accounts in any organizational directory (Any Azure AD directory - Multitenant)" for multi-tenant
     - "Accounts in any organizational directory (Any Azure AD directory - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)" for broader access
   - Redirect URI: Select "Web" and enter `http://localhost:4000/api/auth/microsoft/callback` (adjust based on your CALLBACK_URL_BASE)
5. Click "Register"
6. In the app overview page, copy the "Application (client) ID" - this is your `MICROSOFT_CLIENT_ID`
7. Copy the "Directory (tenant) ID" - this can be your `MICROSOFT_TENANT_ID`, or use "common" for multi-tenant
8. Go to "Certificates & secrets" in the left menu
9. Click "New client secret", add a description and expiration period
10. Copy the secret value immediately (it won't be shown again) - this is your `MICROSOFT_CLIENT_SECRET`
11. Go to "API permissions" and ensure the following Microsoft Graph permissions are granted:
    - `User.Read` (should be added by default)
    - `profile`
    - `email`
    - `openid`
12. If you added new permissions, you may need to grant admin consent

### Tenant Configuration

- Use `MICROSOFT_TENANT_ID=common` to allow users from any Azure AD tenant and personal Microsoft accounts
- Use `MICROSOFT_TENANT_ID=organizations` to allow users from any Azure AD tenant (no personal accounts)
- Use your specific tenant ID to restrict to your organization only

## Configuring Session Secret

The SESSION_SECRET environment variable is used to sign the session cookie. Generate a strong random string for this value. You can use a command like this:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Testing OAuth Authentication

1. Start the KateChat application
2. Navigate to the login page
3. Click on the "Google", "GitHub", or "Microsoft" button
4. You should be redirected to the respective provider's authentication page
5. After authenticating, you should be redirected back to KateChat and automatically logged in

## Troubleshooting

- **Callback URL Errors**: Make sure the callback URLs in your OAuth provider settings exactly match the URLs used in your application.
- **CORS Issues**: If you encounter CORS errors, ensure your frontend URL is correctly set in the backend CORS configuration.
- **Session Problems**: If sessions aren't working, check that your SESSION_SECRET is properly set and express-session is configured correctly.