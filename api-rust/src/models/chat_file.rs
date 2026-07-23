//! Chat files: images generated in chats and inline chat-context documents.
//! Backs the Library page queries (`getAllImages` / `getChatFiles`) — the
//! same GraphQL surface as the Node API's `ChatFile` entity.

use async_graphql::{InputObject, SimpleObject};
use chrono::{NaiveDateTime, Utc};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::chat::GqlChat;
use crate::models::message::GqlMessage;
use crate::schema::chat_files;

pub const CHAT_FILE_TYPE_IMAGE: &str = "image";
pub const CHAT_FILE_TYPE_INLINE_DOCUMENT: &str = "inline_document";

#[derive(Debug, Clone, Serialize, Deserialize, Queryable, Insertable)]
#[diesel(table_name = chat_files)]
pub struct ChatFile {
    pub id: String,
    pub chat_id: String,
    pub message_id: Option<String>,
    #[serde(rename = "type")]
    pub type_: String,
    pub file_name: Option<String>,
    pub mime: Option<String>,
    pub upload_file: Option<String>,
    pub predominant_color: Option<String>,
    pub exif: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl ChatFile {
    pub fn new_image(
        chat_id: String,
        message_id: Option<String>,
        file_name: String,
        mime: String,
    ) -> Self {
        let now = Utc::now().naive_utc();
        Self {
            id: Uuid::new_v4().to_string(),
            chat_id,
            message_id,
            type_: CHAT_FILE_TYPE_IMAGE.to_string(),
            file_name: Some(file_name),
            mime: Some(mime),
            upload_file: None,
            predominant_color: None,
            exif: None,
            created_at: now,
            updated_at: now,
        }
    }
}

pub fn file_url(file_name: &str) -> String {
    format!("/files/{}", file_name)
}

/// Library "Images" entry (client `GetAllImages` query).
#[derive(Debug, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "GqlImage")]
pub struct GqlImage {
    pub id: String,
    pub file_name: String,
    pub file_url: String,
    pub mime: Option<String>,
    pub predominant_color: Option<String>,
    pub role: Option<String>,
    pub created_at: NaiveDateTime,
    pub message: Option<GqlMessage>,
    pub chat: Option<GqlChat>,
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct GqlImagesList {
    pub images: Vec<GqlImage>,
    pub next_page: Option<i32>,
    pub error: Option<String>,
}

/// Library "Chat Data" entry (client `GetChatFiles` query).
#[derive(Debug, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "GqlChatFile")]
pub struct GqlChatFile {
    pub id: String,
    pub file_name: Option<String>,
    pub file_url: Option<String>,
    #[graphql(name = "type")]
    pub type_: String,
    pub mime: Option<String>,
    pub upload_file: Option<String>,
    pub predominant_color: Option<String>,
    pub role: Option<String>,
    pub created_at: NaiveDateTime,
    pub message: Option<GqlMessage>,
    pub chat: Option<GqlChat>,
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct GqlChatFilesList {
    pub files: Vec<GqlChatFile>,
    pub next_page: Option<i32>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct GetImagesInput {
    #[graphql(default = 0)]
    pub offset: i32,
    #[graphql(default = 100)]
    pub limit: i32,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct GetChatFilesInput {
    #[graphql(default = 0)]
    pub offset: i32,
    #[graphql(default = 20)]
    pub limit: i32,
    /// Defaults to inline chat-context documents when not provided.
    pub types: Option<Vec<String>>,
}
