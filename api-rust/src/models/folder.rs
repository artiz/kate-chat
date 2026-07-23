//! Chat folders (sidebar tree) — mirrors the Node API's ChatFolder entity.

use async_graphql::InputObject;
use chrono::{NaiveDateTime, Utc};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::mcp_server::GqlFolder;
use crate::schema::chat_folders;

#[derive(Debug, Clone, Serialize, Deserialize, Queryable, Insertable)]
#[diesel(table_name = chat_folders)]
pub struct ChatFolder {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub user_id: Option<String>,
    pub parent_id: Option<String>,
    pub top_parent_id: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl ChatFolder {
    pub fn new(
        name: String,
        color: Option<String>,
        user_id: String,
        parent_id: Option<String>,
        top_parent_id: Option<String>,
    ) -> Self {
        let now = Utc::now().naive_utc();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            color,
            user_id: Some(user_id),
            parent_id,
            top_parent_id,
            created_at: now,
            updated_at: now,
        }
    }
}

impl From<ChatFolder> for GqlFolder {
    fn from(folder: ChatFolder) -> Self {
        GqlFolder {
            id: folder.id,
            name: folder.name,
            color: folder.color,
            parent_id: folder.parent_id,
            top_parent_id: folder.top_parent_id,
            chats_count: None,
            created_at: folder.created_at,
            updated_at: folder.updated_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct CreateFolderInput {
    pub name: String,
    pub color: Option<String>,
    pub parent_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct UpdateFolderInput {
    pub name: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct GetFolderContentsInput {
    pub folder_id: String,
    #[graphql(default = 0)]
    pub from: i32,
    #[graphql(default = 25)]
    pub limit: i32,
}

#[derive(Debug, Serialize, Deserialize, async_graphql::SimpleObject)]
pub struct GqlFolderContents {
    pub subfolders: Vec<GqlFolder>,
    pub chats: Vec<crate::models::GqlChat>,
    pub next: Option<f64>,
    pub total: Option<i32>,
}
