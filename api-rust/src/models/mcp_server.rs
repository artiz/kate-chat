//! MCP servers: schema-compatible read surface over the existing
//! `mcp_servers` table. Tool invocation is not ported yet (`mcpEnabled` in
//! appConfig stays false); this exists so the client's bootstrap
//! `mcpServers` query validates and lists configured servers.

use async_graphql::SimpleObject;
use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Queryable)]
#[diesel(table_name = crate::schema::mcp_servers)]
pub struct McpServer {
    pub id: String,
    pub name: String,
    pub url: String,
    pub description: Option<String>,
    pub transport_type: String,
    pub auth_type: String,
    pub auth_config: Option<String>,
    pub tools: Option<String>,
    pub is_active: bool,
    pub user_id: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "MCPAuthConfig")]
#[serde(rename_all = "camelCase", default)]
pub struct GqlMcpAuthConfig {
    pub header_name: Option<String>,
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub token_url: Option<String>,
    pub authorization_url: Option<String>,
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "MCPTool")]
#[serde(rename_all = "camelCase", default)]
pub struct GqlMcpTool {
    pub name: Option<String>,
    pub description: Option<String>,
    pub input_schema: Option<String>,
    pub output_schema: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "MCPServer")]
pub struct GqlMcpServer {
    pub id: String,
    pub name: String,
    pub user_id: Option<String>,
    pub url: String,
    pub description: Option<String>,
    pub transport_type: String,
    pub auth_type: String,
    pub access: String,
    pub auth_config: Option<GqlMcpAuthConfig>,
    pub tools: Option<Vec<GqlMcpTool>>,
    pub is_active: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl From<McpServer> for GqlMcpServer {
    fn from(server: McpServer) -> Self {
        let auth_config = server
            .auth_config
            .as_ref()
            .and_then(|s| serde_json::from_str(s).ok());
        let tools = server
            .tools
            .as_ref()
            .and_then(|s| serde_json::from_str(s).ok());
        Self {
            id: server.id,
            name: server.name,
            access: if server.user_id.is_some() {
                "PRIVATE".to_string()
            } else {
                "SHARED".to_string()
            },
            user_id: server.user_id,
            url: server.url,
            description: server.description,
            transport_type: server.transport_type,
            auth_type: server.auth_type,
            auth_config,
            tools,
            is_active: server.is_active,
            created_at: server.created_at,
            updated_at: server.updated_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "MCPServersList")]
pub struct GqlMcpServersList {
    pub servers: Vec<GqlMcpServer>,
    pub total: Option<i32>,
    pub error: Option<String>,
}

/// Chat folder (sidebar tree). Folders are not ported yet — the type exists
/// so the client's `getFolders` bootstrap query validates; the list is
/// always empty.
#[derive(Debug, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "Folder")]
pub struct GqlFolder {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub parent_id: Option<String>,
    pub top_parent_id: Option<String>,
    pub chats_count: Option<i32>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct GqlFoldersList {
    pub folders: Vec<GqlFolder>,
    pub error: Option<String>,
}
