use async_graphql::{Enum, InputObject, SimpleObject};
use chrono::{NaiveDateTime, Utc};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::{GqlChat, User};
use crate::schema::messages;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Enum, Copy, Eq)]
pub enum MessageRole {
    User,
    Assistant,
    System,
    Error,
}

impl From<String> for MessageRole {
    fn from(role: String) -> Self {
        match role.to_lowercase().as_str() {
            "assistant" => MessageRole::Assistant,
            "system" => MessageRole::System,
            "error" => MessageRole::Error,
            _ => MessageRole::User,
        }
    }
}

impl From<&str> for MessageRole {
    fn from(role: &str) -> Self {
        match role.to_lowercase().as_str() {
            "assistant" => MessageRole::Assistant,
            "system" => MessageRole::System,
            "error" => MessageRole::Error,
            _ => MessageRole::User,
        }
    }
}

impl From<MessageRole> for String {
    fn from(role: MessageRole) -> Self {
        match role {
            MessageRole::Assistant => "assistant".to_string(),
            MessageRole::System => "system".to_string(),
            MessageRole::User => "user".to_string(),
            MessageRole::Error => "error".to_string(),
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
    pub json_content: Option<String>,
    pub metadata: Option<String>,
}

impl Message {
    pub fn get_role(&self) -> MessageRole {
        MessageRole::from(self.role.as_str())
    }

    pub fn get_body(&self) -> &str {
        &self.content
    }
}

impl Message {
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
            json_content: None,
            metadata: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct GqlMessage {
    pub id: String,
    pub chat_id: String,
    pub user_id: Option<String>,
    pub user: Option<User>,
    pub content: String,
    pub role: String,
    pub model_id: String,
    pub model_name: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub json_content: Option<Vec<ModelMessageContent>>,
    pub metadata: Option<MessageMetadata>,
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

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct MessageUsage {
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub cache_read_input_tokens: Option<i32>,
    pub cache_write_input_tokens: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct MessageMetadata {
    pub usage: MessageUsage,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct ModelMessageContent {
    pub content: String,
    pub content_type: Option<String>,
    pub file_name: Option<String>,
    pub mime_type: Option<String>,
}

impl From<Message> for GqlMessage {
    fn from(message: Message) -> Self {
        Self {
            id: message.id,
            chat_id: message.chat_id,
            user_id: message.user_id,
            user: None,
            content: message.content,
            role: message.role,
            model_id: message.model_id,
            model_name: message.model_name,
            created_at: message.created_at,
            updated_at: message.updated_at,
            json_content: None,
            metadata: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct GqlMessagesList {
    pub messages: Vec<GqlMessage>,
    pub chat: Option<GqlChat>,
    pub total: Option<i32>,
    pub has_more: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub enum MessageType {
    Message,
    System,
}

impl From<MessageType> for String {
    fn from(msg_type: MessageType) -> Self {
        match msg_type {
            MessageType::Message => "message".to_string(),
            MessageType::System => "system".to_string(),
        }
    }
}

impl From<String> for MessageType {
    fn from(msg_type: String) -> Self {
        match msg_type.as_str() {
            "message" => MessageType::Message,
            "system" => MessageType::System,
            &_ => todo!(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct EditMessageResponse {
    pub message: Option<GqlMessage>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct GqlNewMessage {
    pub message: Option<GqlMessage>,
    pub error: Option<String>,
    pub streaming: Option<bool>,
    pub r#type: String,
}
