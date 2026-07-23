//! Minimal MCP (Model Context Protocol) client over Streamable HTTP:
//! JSON-RPC `initialize` → `tools/list` / `tools/call`. Responses may come
//! back as plain JSON or as an SSE stream — both are handled. Mirrors the
//! Node API's mcp.service (which uses the official SDK client).

use serde_json::{json, Value};

use crate::models::{GqlMcpAuthConfig, McpServer};
use crate::utils::errors::AppError;

const MCP_PROTOCOL_VERSION: &str = "2025-03-26";

pub struct McpClient {
    client: reqwest::Client,
    url: String,
    auth_header: Option<(String, String)>,
    session_id: Option<String>,
}

impl McpClient {
    /// Build a client for a stored server; `auth_token` is the per-request
    /// OAuth/Bearer token supplied by the web client (mcpTokens).
    pub fn for_server(server: &McpServer, auth_token: Option<&str>) -> Self {
        let auth_config: Option<GqlMcpAuthConfig> = server
            .auth_config
            .as_ref()
            .and_then(|s| serde_json::from_str(s).ok());

        let auth_header = match server.auth_type.as_str() {
            "BEARER" | "OAUTH2" => auth_token
                .map(|t| ("Authorization".to_string(), format!("Bearer {}", t)))
                .or_else(|| {
                    auth_config.as_ref().and_then(|c| {
                        c.client_secret
                            .clone()
                            .map(|s| ("Authorization".to_string(), format!("Bearer {}", s)))
                    })
                }),
            "API_KEY" => auth_config.as_ref().and_then(|c| {
                let header = c
                    .header_name
                    .clone()
                    .unwrap_or_else(|| "Authorization".to_string());
                c.client_secret.clone().map(|secret| (header, secret))
            }),
            _ => None,
        };

        Self {
            client: reqwest::Client::new(),
            url: server.url.clone(),
            auth_header,
            session_id: None,
        }
    }

    async fn rpc(&mut self, method: &str, params: Value) -> Result<Value, AppError> {
        let body = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        });

        let mut request = self
            .client
            .post(&self.url)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream");
        if let Some((name, value)) = &self.auth_header {
            request = request.header(name.as_str(), value.as_str());
        }
        if let Some(session) = &self.session_id {
            request = request.header("Mcp-Session-Id", session.as_str());
        }

        let response = request
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Http(format!("MCP request failed: {}", e)))?;

        if let Some(session) = response
            .headers()
            .get("mcp-session-id")
            .and_then(|v| v.to_str().ok())
        {
            self.session_id = Some(session.to_string());
        }

        let status = response.status();
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let text = response
            .text()
            .await
            .map_err(|e| AppError::Http(format!("MCP response read failed: {}", e)))?;

        if !status.is_success() {
            return Err(AppError::Http(format!(
                "MCP server error ({}): {}",
                status,
                text.chars().take(300).collect::<String>()
            )));
        }

        // Streamable HTTP may answer as an SSE stream — take the first
        // data: payload carrying our JSON-RPC response.
        let payload = if content_type.contains("text/event-stream") {
            text.lines()
                .filter_map(|line| line.trim().strip_prefix("data:"))
                .map(str::trim)
                .find(|data| data.contains("\"jsonrpc\""))
                .map(|s| s.to_string())
                .ok_or_else(|| {
                    AppError::Internal("MCP SSE response contained no JSON-RPC payload".to_string())
                })?
        } else {
            text
        };

        let value: Value = serde_json::from_str(&payload)
            .map_err(|e| AppError::Internal(format!("Invalid MCP response JSON: {}", e)))?;

        if let Some(error) = value.get("error") {
            let message = error
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("unknown error");
            return Err(AppError::Http(format!("MCP error: {}", message)));
        }

        Ok(value.get("result").cloned().unwrap_or(Value::Null))
    }

    async fn initialize(&mut self) -> Result<(), AppError> {
        self.rpc(
            "initialize",
            json!({
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": { "name": "kate-chat", "version": env!("CARGO_PKG_VERSION") },
            }),
        )
        .await?;
        Ok(())
    }

    /// List the server's tools (initialize + tools/list).
    pub async fn list_tools(&mut self) -> Result<Vec<Value>, AppError> {
        self.initialize().await?;
        let result = self.rpc("tools/list", json!({})).await?;
        Ok(result
            .get("tools")
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default())
    }

    /// Call a tool and return the result content as text.
    pub async fn call_tool(&mut self, name: &str, args: Value) -> Result<String, AppError> {
        self.initialize().await?;
        let result = self
            .rpc("tools/call", json!({ "name": name, "arguments": args }))
            .await?;

        let text = result
            .get("content")
            .and_then(|c| c.as_array())
            .map(|blocks| {
                blocks
                    .iter()
                    .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| result.to_string());
        Ok(text)
    }
}

/// Map raw MCP tool descriptors to the stored/exposed shape
/// (name/description/inputSchema/outputSchema as JSON strings).
pub fn tools_to_stored_json(tools: &[Value]) -> String {
    let mapped: Vec<Value> = tools
        .iter()
        .map(|t| {
            json!({
                "name": t.get("name").and_then(|v| v.as_str()).unwrap_or_default(),
                "description": t.get("description").and_then(|v| v.as_str()),
                "inputSchema": t.get("inputSchema").map(|v| v.to_string()),
                "outputSchema": t.get("outputSchema").map(|v| v.to_string()),
            })
        })
        .collect();
    serde_json::to_string(&mapped).unwrap_or_else(|_| "[]".to_string())
}
