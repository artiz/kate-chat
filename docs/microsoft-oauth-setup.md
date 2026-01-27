# Microsoft Azure OAuth Setup for KateChat

This guide walks you through setting up Microsoft Azure OAuth authentication for KateChat.

## Prerequisites

- An Azure account with access to Azure Active Directory
- KateChat application running locally or deployed

## Step 1: Create an Enterprise Application in Azure

1. Go to the [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**

## Step 2: Configure the Application

### Basic Information
- **Name**: KateChat (or your preferred name)
- **Supported account types**: Choose one:
  - **Accounts in any organizational directory (Any Azure AD directory - Multitenant)** - for organizations only
  - **Accounts in any organizational directory and personal Microsoft accounts** - for broader access including personal accounts
- **Redirect URI**: 
  - Type: Web
  - URL: `http://localhost:4000/api/auth/microsoft/callback` (production: https://katechat.tech/auth/microsoft/callback)

### Get Application Details
After registration, copy these values from the **Overview** page:
- **Application (client) ID** → This is your `MICROSOFT_CLIENT_ID`
- **Directory (tenant) ID** → This is your `MICROSOFT_TENANT_ID` (or use "common" for multi-tenant)

## Step 3: Create Client Secret

1. Go to **Certificates & secrets** in the left menu
2. Click **New client secret**
3. Add a description and choose expiration period
4. **Important**: Copy the secret value immediately (it won't be shown again)
5. This value is your `MICROSOFT_CLIENT_SECRET`

## Step 4: Set API Permissions

1. Go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Choose **Delegated permissions**
5. Add these permissions:
   - `User.Read` (should be added by default)
6. Click **Add permissions**
7. **Important**: Click **Grant admin consent for [Your Organization]** 
   - This step is crucial - without admin consent, users will get authorization errors
   - If you don't have admin privileges, ask your Azure administrator to grant consent

### Verification
After granting consent, you should see green checkmarks next to all permissions indicating they are granted for your organization.

## Step 5: Configure Environment Variables

Add these to your `.env` file in the API directory:

```env
# Microsoft OAuth Configuration
MICROSOFT_CLIENT_ID=your_application_client_id_here
MICROSOFT_CLIENT_SECRET=your_client_secret_here
MICROSOFT_TENANT_ID=common

# Base URLs (adjust for production)
CALLBACK_URL_BASE=http://localhost:4000
FRONTEND_URL=http://localhost:3000
```

### Tenant Configuration Options

- `MICROSOFT_TENANT_ID=common` - Allow users from any Azure AD tenant + personal Microsoft accounts
- `MICROSOFT_TENANT_ID=organizations` - Allow users from any Azure AD tenant (no personal accounts)
- `MICROSOFT_TENANT_ID=your-tenant-id` - Restrict to your specific organization only

## Step 6: Test the Integration

1. Start your KateChat application
2. Navigate to the login page
3. Click the **Microsoft** button
4. You should be redirected to Microsoft's authentication page
5. After successful authentication, you'll be redirected back to KateChat

## Troubleshooting

### Common Issues

1. **"Authorization_RequestDenied" or "Insufficient privileges" (403 error)**:
   - This means admin consent has not been granted for the Microsoft Graph permissions
   - Go to Azure Portal > Your App > API permissions
   - Click "Grant admin consent for [Your Organization]"
   - Ensure you see green checkmarks next to all permissions
   - If you're not an admin, ask your Azure administrator to grant consent

2. **Invalid redirect URI**: Ensure the redirect URI in Azure matches exactly: `http://localhost:4000/api/auth/microsoft/callback`

3. **Tenant restrictions**: If users can't log in, check your tenant configuration and supported account types

4. **Client secret expired**: Client secrets expire - create a new one if authentication fails

### Production Deployment

For production:
- Update redirect URI to your production domain: `https://yourdomain.com/auth/microsoft/callback`
- Use environment-specific client IDs and secrets
- Consider using specific tenant ID instead of "common" for better security

## Security Considerations

- Store client secrets securely (use Azure Key Vault in production)
- Regularly rotate client secrets
- Monitor authentication logs in Azure AD
- Use specific tenant ID for organizational apps to prevent unauthorized access