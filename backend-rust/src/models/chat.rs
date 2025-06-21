use async_graphql::{InputObject, SimpleObject};
use chrono::{NaiveDateTime, Utc};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::schema::chats;

#[derive(Debug, Clone, Serialize, Deserialize, Queryable, Insertable, SimpleObject)]
#[diesel(table_name = chats)]
pub struct Chat {
    pub id: String,
    pub title: String,
    pub description: String,
    pub user_id: Option<String>,
    pub files: Option<String>, // JSON string
    pub messages_count: Option<i32>,
    pub model_id: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub top_p: Option<f32>,
    pub is_pristine: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Serialize, Deserialize, Insertable)]
#[diesel(table_name = chats)]
pub struct NewChat {
    pub id: String,
    pub title: String,
    pub description: String,
    pub user_id: Option<String>,
    pub files: Option<String>,
    pub messages_count: Option<i32>,
    pub model_id: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub top_p: Option<f32>,
    pub is_pristine: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl NewChat {
    pub fn new(
        title: String,
        description: Option<String>,
        user_id: Option<String>,
        model_id: Option<String>,
    ) -> Self {
        let now = Utc::now().naive_utc();
        Self {
            id: Uuid::new_v4().to_string(),
            title,
            description: description.unwrap_or_default(),
            user_id,
            files: None,
            messages_count: Some(0),
            model_id,
            temperature: None,
            max_tokens: None,
            top_p: None,
            is_pristine: true,
            created_at: now,
            updated_at: now,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct CreateChatInput {
    pub title: String,
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
pub struct GqlChat {
    pub id: String,
    pub title: String,
    pub description: String,
    pub user_id: Option<String>,
    pub files: Option<String>, // JSON string
    pub messages_count: Option<i32>,
    pub model_id: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub top_p: Option<f32>,
    pub is_pristine: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub last_bot_message: Option<String>,
    pub last_bot_message_id: Option<String>,
}

impl From<Chat> for GqlChat {
    fn from(chat: Chat) -> Self {
        Self {
            id: chat.id,
            title: chat.title,
            description: chat.description,
            user_id: chat.user_id,
            files: chat.files,
            messages_count: chat.messages_count,
            model_id: chat.model_id,
            temperature: chat.temperature,
            max_tokens: chat.max_tokens,
            top_p: chat.top_p,
            is_pristine: chat.is_pristine,
            created_at: chat.created_at,
            updated_at: chat.updated_at,
            last_bot_message: None,
            last_bot_message_id: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct GqlChatsList {
    pub chats: Vec<GqlChat>,
    pub total: Option<i32>,
    pub has_more: bool,
    pub error: Option<String>,
}
