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
    pub folder_id: Option<String>,
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
    #[diesel(sql_type = Nullable<Text>)]
    pub folder_id: Option<String>,
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
    pub folder_id: Option<String>,
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
            folder_id: None,
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

/// Chat generation settings exposed as a nested object (the Node API moved
/// per-chat settings into one JSON column; api-rust keeps flat columns and
/// assembles/destructures this object at the GraphQL boundary). Fields
/// without a backing column (thinking, voice, …) are accepted but not
/// persisted yet.
#[derive(Debug, Clone, Default, Serialize, Deserialize, SimpleObject, InputObject)]
#[graphql(input_name = "ChatSettingsInput")]
pub struct ChatSettings {
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub top_p: Option<f32>,
    pub images_count: Option<i32>,
    pub image_quality: Option<String>,
    pub image_orientation: Option<String>,
    pub system_prompt: Option<String>,
    pub disable_top_p: Option<bool>,
    pub thinking: Option<bool>,
    pub thinking_budget: Option<i32>,
    pub cache_retention: Option<String>,
    pub voice: Option<String>,
    pub selected_rag_doc_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, InputObject)]
pub struct ChatToolOptionsInput {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, InputObject)]
pub struct ChatToolInput {
    /// Tool type name (WEB_SEARCH, MCP, …)
    #[serde(rename = "type")]
    pub r#type: String,
    pub name: Option<String>,
    pub id: Option<String>,
    pub options: Option<Vec<ChatToolOptionsInput>>,
}

impl From<ChatToolInput> for ChatTool {
    fn from(input: ChatToolInput) -> Self {
        ChatTool {
            id: input.id,
            name: input.name.unwrap_or_default(),
            r#type: input.r#type,
            options: input.options.map(|opts| {
                opts.into_iter()
                    .map(|o| ChatToolOptions {
                        name: o.name,
                        value: o.value,
                    })
                    .collect()
            }),
        }
    }
}

#[derive(Debug, InputObject)]
pub struct UpdateChatInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub model_id: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub top_p: Option<f32>,
    pub is_pinned: Option<bool>,
    /// Undefined → unchanged, null → remove from folder, value → move
    pub folder_id: async_graphql::MaybeUndefined<String>,
    pub settings: Option<ChatSettings>,
    pub tools: Option<Vec<ChatToolInput>>,
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
    /// Always null until chat folders are ported.
    pub folder_id: Option<String>,
    pub settings: Option<ChatSettings>,
    pub user: Option<User>,
    pub chat_documents: Option<Vec<GqlChatDocument>>,
}

fn chat_settings(
    system_prompt: &Option<String>,
    temperature: Option<f32>,
    max_tokens: Option<i32>,
    top_p: Option<f32>,
    images_count: Option<i32>,
) -> ChatSettings {
    ChatSettings {
        temperature,
        max_tokens,
        top_p,
        images_count,
        system_prompt: system_prompt.clone(),
        ..ChatSettings::default()
    }
}

impl From<Chat> for GqlChat {
    fn from(chat: Chat) -> Self {
        let tools_parsed = chat
            .tools
            .as_ref()
            .and_then(|s| serde_json::from_str::<Vec<ChatTool>>(s).ok());
        let settings = Some(chat_settings(
            &chat.system_prompt,
            chat.temperature,
            chat.max_tokens,
            chat.top_p,
            chat.images_count,
        ));
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
            folder_id: chat.folder_id,
            settings,
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
        let settings = Some(chat_settings(
            &chat.system_prompt,
            chat.temperature,
            chat.max_tokens,
            chat.top_p,
            chat.images_count,
        ));
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
            folder_id: chat.folder_id,
            settings,
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
