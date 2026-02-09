use async_graphql::{InputObject, SimpleObject};
use chrono::{NaiveDateTime, Utc};
use diesel::prelude::*;
use diesel::sql_types::{Bool, Float, Integer, Nullable, Text, Timestamp};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::User;
use crate::schema::chats;

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct ChatToolOptions {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct ChatTool {
    pub id: Option<String>,
    pub name: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub options: Option<Vec<ChatToolOptions>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct ChatDocumentInfo {
    pub id: String,
    pub file_name: Option<String>,
    pub status: Option<String>,
    pub download_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct GqlChatDocument {
    pub document: ChatDocumentInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize, Queryable, Insertable)]
#[diesel(table_name = chats)]
pub struct Chat {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub user_id: Option<String>,
    pub last_bot_message: Option<String>,
    pub last_bot_message_id: Option<String>,
    pub messages_count: Option<i32>,
    pub model_id: Option<String>,
    pub system_prompt: Option<String>,
    pub tools: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub top_p: Option<f32>,
    pub images_count: Option<i32>,
    pub is_pristine: bool,
    pub is_pinned: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

// Custom struct for the joined chat query result
#[derive(QueryableByName, Debug)]
pub struct ChatWithStats {
    #[diesel(sql_type = Text)]
    pub id: String,
    #[diesel(sql_type = Text)]
    pub title: String,
    #[diesel(sql_type = Nullable<Text>)]
    pub description: Option<String>,
    #[diesel(sql_type = Nullable<Text>)]
    pub user_id: Option<String>,
    #[diesel(sql_type = Nullable<Text>)]
    pub last_bot_message: Option<String>,
    #[diesel(sql_type = Nullable<Text>)]
    pub last_bot_message_id: Option<String>,
    #[diesel(sql_type = Nullable<Integer>)]
    pub messages_count: Option<i32>,
    #[diesel(sql_type = Nullable<Text>)]
    pub model_id: Option<String>,
    #[diesel(sql_type = Nullable<Text>)]
    pub system_prompt: Option<String>,
    #[diesel(sql_type = Nullable<Text>)]
    pub tools: Option<String>,
    #[diesel(sql_type = Nullable<Float>)]
    pub temperature: Option<f32>,
    #[diesel(sql_type = Nullable<Integer>)]
    pub max_tokens: Option<i32>,
    #[diesel(sql_type = Nullable<Float>)]
    pub top_p: Option<f32>,
    #[diesel(sql_type = Nullable<Integer>)]
    pub images_count: Option<i32>,
    #[diesel(sql_type = Bool)]
    pub is_pristine: bool,
    #[diesel(sql_type = Bool)]
    pub is_pinned: bool,
    #[diesel(sql_type = Timestamp)]
    pub created_at: chrono::NaiveDateTime,
    #[diesel(sql_type = Timestamp)]
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Debug, Serialize, Deserialize, Insertable)]
#[diesel(table_name = chats)]
pub struct NewChat {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub user_id: Option<String>,
    pub model_id: Option<String>,
    pub system_prompt: Option<String>,
    pub tools: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub top_p: Option<f32>,
    pub is_pristine: bool,
    pub is_pinned: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl NewChat {
    pub fn new(
        title: String,
        description: Option<String>,
        user_id: Option<String>,
        model_id: Option<String>,
        system_prompt: Option<String>,
    ) -> Self {
        let now = Utc::now().naive_utc();
        Self {
            id: Uuid::new_v4().to_string(),
            title,
            description,
            user_id,
            model_id,
            system_prompt,
            tools: None,
            temperature: None,
            max_tokens: None,
            top_p: None,
            is_pristine: true,
            is_pinned: false,
            created_at: now,
            updated_at: now,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct CreateChatInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub model_id: Option<String>,
    pub system_prompt: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct UpdateChatInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub model_id: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub top_p: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "Chat")]
pub struct GqlChat {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub user_id: Option<String>,
    pub model_id: Option<String>,
    pub system_prompt: Option<String>,
    pub tools: Option<Vec<ChatTool>>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub top_p: Option<f32>,
    pub images_count: Option<i32>,
    pub is_pristine: bool,
    pub is_pinned: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub messages_count: Option<i32>,
    pub last_bot_message: Option<String>,
    pub last_bot_message_id: Option<String>,
    pub user: Option<User>,
    pub chat_documents: Option<Vec<GqlChatDocument>>,
}

impl From<Chat> for GqlChat {
    fn from(chat: Chat) -> Self {
        let tools_parsed = chat
            .tools
            .as_ref()
            .and_then(|s| serde_json::from_str::<Vec<ChatTool>>(s).ok());
        Self {
            id: chat.id,
            title: chat.title,
            description: chat.description,
            user_id: chat.user_id,
            model_id: chat.model_id,
            system_prompt: chat.system_prompt,
            tools: tools_parsed,
            temperature: chat.temperature,
            max_tokens: chat.max_tokens,
            top_p: chat.top_p,
            images_count: chat.images_count,
            is_pristine: chat.is_pristine,
            is_pinned: chat.is_pinned,
            created_at: chat.created_at,
            updated_at: chat.updated_at,
            messages_count: chat.messages_count,
            last_bot_message: chat.last_bot_message,
            last_bot_message_id: chat.last_bot_message_id,
            user: None,
            chat_documents: Some(vec![]),
        }
    }
}

impl From<ChatWithStats> for GqlChat {
    fn from(chat: ChatWithStats) -> Self {
        let tools_parsed = chat
            .tools
            .as_ref()
            .and_then(|s| serde_json::from_str::<Vec<ChatTool>>(s).ok());
        Self {
            id: chat.id,
            title: chat.title,
            description: chat.description,
            user_id: chat.user_id,
            model_id: chat.model_id,
            system_prompt: chat.system_prompt,
            tools: tools_parsed,
            temperature: chat.temperature,
            max_tokens: chat.max_tokens,
            top_p: chat.top_p,
            images_count: chat.images_count,
            is_pristine: chat.is_pristine,
            is_pinned: chat.is_pinned,
            created_at: chat.created_at,
            updated_at: chat.updated_at,
            messages_count: chat.messages_count,
            last_bot_message: chat.last_bot_message,
            last_bot_message_id: chat.last_bot_message_id,
            user: None,
            chat_documents: Some(vec![]),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct GqlChatsList {
    pub chats: Vec<GqlChat>,
    pub total: Option<i32>,
    pub next: Option<f64>,
    pub error: Option<String>,
}
