export const MCP_OAUTH_ERROR_TEMPLATE = `<!DOCTYPE html>
<html>
  <head>
    <title>MCP Authorization Failed</title>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap");
      body { font-family: "Noto Sans", "Segoe UI", system-ui, -apple-system, sans-serif; background: #eee; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;  }
      .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; }
      h1 { color: #c72f3e; margin-bottom: 1rem; }
      p { color: #666; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Authorization Failed</h1>
      <p>{{ERROR_DESCRIPTION}}</p>
      <p>You can close this window.</p>
    </div>
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: 'mcp-oauth-error', error: '{{ERROR}}' }, '*');
      }
      setTimeout(() => window.close(), 3000);
    </script>
  </body>
</html>`;

export const MCP_OAUTH_SUCCESS_TEMPLATE = `<!DOCTYPE html>
<html>
  <head>
    <title>MCP {{SERVER_NAME}} Authorization Successful</title>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap");
      body { font-family: "Noto Sans", "Segoe UI", system-ui, -apple-system, sans-serif; background: #eee; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;  }
      .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; }
      h1 { color: #208f3a; margin-bottom: 1rem; }
      p { color: #666; }
      .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #28a745; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 1rem auto; }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Authorization Successful!</h1>
      <div class="spinner"></div>
      <p>Completing authentication...</p>
    </div>
    <script>
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
  </body>
</html>`;
