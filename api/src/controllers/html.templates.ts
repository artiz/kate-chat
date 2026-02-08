export const HTML_TEMPLATE = (content: string, script?: string) => `
<!DOCTYPE html>
<html>
  <head>
    <title>MCP Authorization Failed</title>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap");
      body { font-family: "Noto Sans", "Segoe UI", system-ui, -apple-system, sans-serif; background: #d5d5d8; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;  }
      .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; }
      .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #28a745; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 1rem auto; }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      h1 { margin-bottom: 1rem; }
      .error { color: #c72f3e; }
      .success { color: #208f3a; }
      p { color: #666; }
      
    </style>
  </head>
  <body>
    <div class="container">
      ${content}
    </div>
    ${script || ""}
  </body>
</html>`;

export const MCP_OAUTH_ERROR_TEMPLATE = HTML_TEMPLATE(
  `
    <h1 class="error">MCP Authorization Failed</h1>
    <p>{{ERROR_DESCRIPTION}}</p>
    <p>You can close this window.</p>
  `,
  `<script>
  if (window.opener) {
      window.opener.postMessage({ type: 'mcp-oauth-error', error: '{{ERROR}}' }, '*');
    }
    setTimeout(() => window.close(), 3000);
    </script>
  `
);

export const MCP_OAUTH_SUCCESS_TEMPLATE = HTML_TEMPLATE(
  `
      <h1>MCP {{SERVER_NAME}} Authorization Successful!</h1>
      <div class="spinner"></div>
      <p>You can close this window</p>
    `,
  `<script>
      const serverId = '{{SERVER_ID}}';
      const accessToken = '{{ACCESS_TOKEN}}';
      const refreshToken = '{{REFRESH_TOKEN}}';
      const expiresAt = '{{EXPIRES_AT}}';
      
      localStorage.setItem('mcp.' + serverId + '.access_token', accessToken);
      if (refreshToken) {
        localStorage.setItem('mcp.' + serverId + '.refresh_token', refreshToken);
      }
      if (expiresAt) {
        localStorage.setItem('mcp.' + serverId + '.expires_at', expiresAt);
      }
      
      if (window.opener) {
        window.opener.postMessage({ 
          type: 'mcp-oauth-callback', 
          serverId: serverId,
          accessToken: accessToken,
          expiresAt: expiresAt ? parseInt(expiresAt, 10) : undefined
        }, '*');
      }
      
      setTimeout(() => window.close(), 1500);
    </script>
  `
);
