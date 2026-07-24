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

#[derive(Debug, Clone, Serialize, Deserialize, Queryable, Insertable)]
#[diesel(table_name = messages)]
pub struct Message {
    pub id: String,
    pub chat_id: String,
    pub user_id: Option<String>,
    pub content: String,
    pub role: String,
    pub model_id: Option<String>,
    pub model_name: Option<String>,
    pub json_content: Option<String>,
    pub metadata: Option<String>,
    pub linked_to_message_id: Option<String>,
    pub status: Option<String>,
    pub status_info: Option<String>,
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
            model_id: Some(model_id),
            model_name,
            created_at: now,
            updated_at: now,
            json_content: None,
            metadata: None,
            linked_to_message_id: None,
            status: None,
            status_info: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "Message")]
pub struct GqlMessage {
    pub id: String,
    pub chat_id: String,
    pub user_id: Option<String>,
    pub user: Option<User>,
    pub content: String,
    pub role: String,
    pub model_id: Option<String>,
    pub model_name: Option<String>,
    pub json_content: Option<Vec<ModelMessageContent>>,
    pub metadata: Option<MessageMetadata>,
    pub linked_to_message_id: Option<String>,
    pub linked_messages: Option<Vec<GqlMessage>>,
    pub status: Option<String>,
    pub status_info: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
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
    /// Voice recording input — accepted for schema compatibility;
    /// audio models are not ported yet.
    pub audio: Option<AudioInput>,
    /// Inline chat-context documents — accepted for schema compatibility;
    /// file content blocks are not ported yet.
    pub files: Option<Vec<FileInput>>,
    pub document_ids: Option<Vec<String>>,
    /// MCP auth tokens — accepted for schema compatibility; MCP is not
    /// ported yet.
    pub mcp_tokens: Option<Vec<McpAuthTokenInput>>,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct ImageInput {
    pub bytes_base64: String,
    pub file_name: String,
    pub mime_type: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct AudioInput {
    pub bytes_base64: String,
    pub file_name: String,
    pub mime_type: String,
    pub duration_sec: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct FileInput {
    pub bytes_base64: String,
    pub file_name: String,
    pub mime_type: String,
    pub size: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct MessageUsage {
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub cache_read_input_tokens: Option<i32>,
    pub cache_write_input_tokens: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct MessageRelevantChunk {
    pub id: String,
    pub document_id: String,
    pub document_name: Option<String>,
    pub page: f64,
    pub page_index: Option<f64>,
    pub content: String,
    pub relevance: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct ChatToolCallResult {
    pub call_id: Option<String>,
    pub name: String,
    pub content: String,
}

/// RAG structured answer. Field names intentionally keep the Node API's
/// snake_case GraphQL names (the client selects them literally).
#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct RagResponse {
    #[graphql(name = "step_by_step_analysis")]
    pub step_by_step_analysis: Option<String>,
    #[graphql(name = "reasoning_summary")]
    pub reasoning_summary: Option<String>,
    #[graphql(name = "final_answer")]
    pub final_answer: Option<String>,
    #[graphql(name = "relevant_chunks_ids")]
    pub relevant_chunks_ids: Option<Vec<String>>,
    #[graphql(name = "chunks_relevance")]
    pub chunks_relevance: Option<Vec<f64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct ChatToolCall {
    pub name: String,
    pub call_id: Option<String>,
    #[graphql(name = "type")]
    #[serde(rename = "type")]
    pub type_: Option<String>,
    pub error: Option<String>,
    pub args: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct ChatResultAnnotation {
    #[graphql(name = "type")]
    #[serde(rename = "type")]
    pub type_: String,
    pub title: Option<String>,
    pub source: Option<String>,
    pub container: Option<String>,
    pub start_index: Option<i32>,
    pub end_index: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct ReasoningChunk {
    pub text: String,
    pub timestamp: Option<NaiveDateTime>,
    pub id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, SimpleObject)]
pub struct MessageMetadata {
    pub usage: Option<MessageUsage>,
    pub document_ids: Option<Vec<String>>,
    pub relevants_chunks: Option<Vec<MessageRelevantChunk>>,
    pub tools: Option<Vec<ChatToolCallResult>>,
    pub request_id: Option<String>,
    pub rag_response: Option<RagResponse>,
    pub tool_calls: Option<Vec<ChatToolCall>>,
    pub annotations: Option<Vec<ChatResultAnnotation>>,
    pub reasoning: Option<Vec<ReasoningChunk>>,
    pub context_messages: Option<Vec<String>>,
    pub tokens_count: Option<i32>,
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
            json_content: message
                .json_content
                .and_then(|json| serde_json::from_str::<Vec<ModelMessageContent>>(&json).ok()),
            metadata: message
                .metadata
                .and_then(|meta| serde_json::from_str::<MessageMetadata>(&meta).ok()),
            linked_to_message_id: message.linked_to_message_id,
            linked_messages: None,
            status: message.status,
            status_info: message.status_info,
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
    /// HTTP-ish status code for `error` (Node API parity).
    pub error_status: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct GqlDeleteMessageResponse {
    pub messages: Vec<GqlMessage>,
}

/// Per-request context passed by the client alongside message mutations
/// (MCP auth tokens, context-limit reset). Accepted for schema
/// compatibility; MCP is not ported yet.
#[derive(Debug, Clone, Serialize, Deserialize, InputObject)]
#[graphql(name = "MessageContext")]
pub struct MessageContextInput {
    pub mcp_tokens: Option<Vec<McpAuthTokenInput>>,
    pub reset_context_limit: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, InputObject)]
#[graphql(name = "MCPAuthTokenInput")]
pub struct McpAuthTokenInput {
    pub server_id: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<f64>,
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

impl Message {
    /// Deserialize the stored metadata JSON (None on absence/corruption).
    pub fn parsed_metadata(&self) -> Option<MessageMetadata> {
        self.metadata
            .as_deref()
            .and_then(|m| serde_json::from_str(m).ok())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct EditMessageResponse {
    pub message: Option<GqlMessage>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct SwitchModelResponse {
    pub message: Option<GqlMessage>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct CallOtherResponse {
    pub message: Option<GqlMessage>,
    pub error: Option<String>,
}

#[derive(Debug, InputObject)]
#[graphql(name = "StopMessageGenerationInput")]
pub struct StopMessageGenerationInput {
    pub request_id: String,
    pub message_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct StopMessageGenerationResponse {
    pub error: Option<String>,
    pub request_id: Option<String>,
    pub message_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct MessageChatInfo {
    pub title: Option<String>,
    pub model_id: Option<String>,
    pub is_pristine: bool,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub top_p: Option<f32>,
    pub images_count: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct GqlNewMessage {
    pub message: Option<GqlMessage>,
    pub chat: Option<MessageChatInfo>,
    pub error: Option<String>,
    pub streaming: Option<bool>,
    pub r#type: String,
}
