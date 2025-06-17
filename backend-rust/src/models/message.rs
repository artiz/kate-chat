use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use chrono::{Utc, NaiveDateTime};
use uuid::Uuid;
use async_graphql::{SimpleObject, InputObject, Enum};

use crate::schema::messages;
use crate::models::{Chat};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Enum, Copy, Eq)]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

impl From<String> for MessageRole {
    fn from(role: String) -> Self {
        match role.to_lowercase().as_str() {
            "assistant" => MessageRole::Assistant,
            "system" => MessageRole::System,
            _ => MessageRole::User,
        }
    }
}

impl From<&str> for MessageRole {
    fn from(role: &str) -> Self {
        match role.to_lowercase().as_str() {
            "assistant" => MessageRole::Assistant,
            "system" => MessageRole::System,
            _ => MessageRole::User,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Queryable, Insertable, SimpleObject)]
#[diesel(table_name = messages)]
pub struct Message {
    pub id: String,
    pub chat_id: String,
    pub user_id: Option<String>,
    pub content: String,
    pub role: String,
    pub model_id: String,
    pub model_name: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl Message {
    pub fn get_role(&self) -> MessageRole {
        MessageRole::from(self.role.as_str())
    }
    
    pub fn get_body(&self) -> &str {
        &self.content
    }
}

#[derive(Debug, Serialize, Deserialize, Insertable)]
#[diesel(table_name = messages)]
pub struct NewMessage {
    pub id: String,
    pub chat_id: String,
    pub user_id: Option<String>,
    pub content: String,
    pub role: String,
    pub model_id: String,
    pub model_name: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl NewMessage {
    pub fn new(
        chat_id: String,
        user_id: Option<String>,
        content: String,
        role: String,
        model_id: String,
        model_name: Option<String>,
    ) -> Self {
        let now = Utc::now().naive_utc();
        Self {
            id: Uuid::new_v4().to_string(),
            chat_id,
            user_id,
            content,
            role,
            model_id,
            model_name,
            created_at: now,
            updated_at: now,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct CreateMessageInput {
    pub chat_id: String,
    pub content: String,
    pub role: Option<String>,
    pub model_id: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub top_p: Option<f32>,
    pub images: Option<Vec<ImageInput>>,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct ImageInput {
    pub bytes_base64: String,
    pub file_name: String,
    pub mime_type: String,
}


#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct GqlMessagesList {
    pub messages: Vec<Message>,
    pub chat: Option<Chat>,
    pub total: Option<i32>,
    pub has_more: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct GqlMessage {
    pub message: Option<Message>,
    pub error: Option<String>,
    pub streaming: Option<bool>,
    pub r#type: String,
}

