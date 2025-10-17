use async_graphql::{InputObject, SimpleObject};
use chrono::{NaiveDateTime, Utc};
use diesel::prelude::*;
use diesel::sql_types::{Bool, Float, Integer, Nullable, Text, Timestamp};
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
    pub model_id: Option<String>,
    pub system_prompt: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub top_p: Option<f32>,
    pub is_pristine: bool,
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
    #[diesel(sql_type = Text)]
    pub description: String,
    #[diesel(sql_type = Nullable<Text>)]
    pub user_id: Option<String>,
    #[diesel(sql_type = Nullable<Text>)]
    pub files: Option<String>,
    #[diesel(sql_type = Nullable<Text>)]
    pub model_id: Option<String>,
    #[diesel(sql_type = Nullable<Text>)]
    pub system_prompt: Option<String>,
    #[diesel(sql_type = Nullable<Float>)]
    pub temperature: Option<f32>,
    #[diesel(sql_type = Nullable<Integer>)]
    pub max_tokens: Option<i32>,
    #[diesel(sql_type = Nullable<Float>)]
    pub top_p: Option<f32>,
    #[diesel(sql_type = Bool)]
    pub is_pristine: bool,
    #[diesel(sql_type = Timestamp)]
    pub created_at: chrono::NaiveDateTime,
    #[diesel(sql_type = Timestamp)]
    pub updated_at: chrono::NaiveDateTime,

    #[diesel(sql_type = Nullable<Integer>)]
    pub messages_count: Option<i32>,
    #[diesel(sql_type = Nullable<Text>)]
    pub last_bot_message: Option<String>,
    #[diesel(sql_type = Nullable<Text>)]
    pub last_bot_message_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Insertable)]
#[diesel(table_name = chats)]
pub struct NewChat {
    pub id: String,
    pub title: String,
    pub description: String,
    pub user_id: Option<String>,
    pub files: Option<String>,
    pub model_id: Option<String>,
    pub system_prompt: Option<String>,
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
        system_prompt: Option<String>,
    ) -> Self {
        let now = Utc::now().naive_utc();
        Self {
            id: Uuid::new_v4().to_string(),
            title,
            description: description.unwrap_or_default(),
            user_id,
            files: None,
            model_id,
            system_prompt,
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
    pub model_id: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub top_p: Option<f32>,
    pub is_pristine: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub messages_count: Option<i32>,
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
            messages_count: Some(0),
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

impl From<ChatWithStats> for GqlChat {
    fn from(chat: ChatWithStats) -> Self {
        Self {
            id: chat.id,
            title: chat.title,
            description: chat.description,
            user_id: chat.user_id,
            files: chat.files,
            model_id: chat.model_id,
            temperature: chat.temperature,
            max_tokens: chat.max_tokens,
            top_p: chat.top_p,
            is_pristine: chat.is_pristine,
            created_at: chat.created_at,
            updated_at: chat.updated_at,
            messages_count: chat.messages_count,
            last_bot_message: chat.last_bot_message,
            last_bot_message_id: chat.last_bot_message_id,
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
