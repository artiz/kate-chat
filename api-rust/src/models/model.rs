use async_graphql::{Enum, InputObject, SimpleObject};
use chrono::{DateTime, NaiveDateTime, Utc};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::User;
use crate::schema::models;

/// Model type exposed to the client as a GraphQL enum (names CHAT,
/// IMAGE_GENERATION, …) while rows keep the Node API's lowercase values
/// ("chat", "image_generation", …) in the `type` column.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Enum)]
pub enum ModelType {
    Chat,
    Embedding,
    ImageGeneration,
    VideoGeneration,
    AudioGeneration,
    Realtime,
    Transcription,
    Other,
}

impl ModelType {
    pub fn as_db_str(&self) -> &'static str {
        match self {
            ModelType::Chat => "chat",
            ModelType::Embedding => "embedding",
            ModelType::ImageGeneration => "image_generation",
            ModelType::VideoGeneration => "video_generation",
            ModelType::AudioGeneration => "audio_generation",
            ModelType::Realtime => "realtime",
            ModelType::Transcription => "transcription",
            ModelType::Other => "other",
        }
    }

    pub fn from_db_str(value: &str) -> Self {
        match value {
            "chat" => ModelType::Chat,
            "embedding" => ModelType::Embedding,
            "image_generation" => ModelType::ImageGeneration,
            "video_generation" => ModelType::VideoGeneration,
            "audio_generation" => ModelType::AudioGeneration,
            "realtime" => ModelType::Realtime,
            "transcription" => ModelType::Transcription,
            _ => ModelType::Other,
        }
    }
}

/// Parse a DB list column that may hold either a JSON array (api-rust) or a
/// comma-separated string (Node's TypeORM simple-array).
fn parse_string_list(value: &Option<String>) -> Option<Vec<String>> {
    let raw = value.as_deref()?.trim();
    if raw.is_empty() {
        return None;
    }
    if let Ok(list) = serde_json::from_str::<Vec<String>>(raw) {
        return Some(list);
    }
    Some(raw.split(',').map(|s| s.trim().to_string()).collect())
}

#[derive(Debug, Clone, Serialize, Deserialize, Queryable, Insertable, SimpleObject)]
#[diesel(table_name = models)]
pub struct Model {
    pub id: String,
    pub name: String,
    pub model_id: String,
    pub description: Option<String>,
    pub user_id: Option<String>,
    pub provider: Option<String>,
    pub api_provider: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub streaming: bool,
    pub image_input: bool,
    pub max_input_tokens: Option<i32>,
    pub tools: Option<String>,
    pub features: Option<String>,
    pub custom_settings: Option<String>,
    pub is_active: bool,
    pub is_custom: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl Model {
    pub fn new(
        name: String,
        description: Option<String>,
        model_id: String,
        api_provider: String,
        user_id: Option<String>,
    ) -> Self {
        let now = Utc::now().naive_utc();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            model_id,
            description,
            user_id,
            provider: None,
            api_provider,
            type_: "chat".to_string(),
            streaming: true,
            image_input: false,
            max_input_tokens: None,
            tools: None,
            features: None,
            custom_settings: None,
            is_active: true,
            is_custom: false,
            created_at: now,
            updated_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[serde(rename_all = "camelCase")] // match the Node API's stored JSON keys
pub struct CustomModelSettings {
    pub endpoint: Option<String>,
    pub api_key: Option<String>,
    pub model_name: Option<String>,
    pub protocol: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "Model")]
pub struct GqlModel {
    pub id: String,
    pub name: String,
    pub model_id: String,
    pub description: Option<String>,
    pub api_provider: String,
    pub provider: Option<String>,
    #[serde(rename = "type")]
    #[graphql(name = "type")]
    pub type_: ModelType,
    pub streaming: bool,
    pub image_input: bool,
    pub max_input_tokens: Option<i32>,
    pub tools: Option<Vec<String>>,
    pub features: Option<Vec<String>>,
    pub custom_settings: Option<CustomModelSettings>,
    pub is_active: bool,
    pub is_custom: bool,
    pub user: User,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl GqlModel {
    pub fn from_model(model: &Model, user: User) -> Self {
        Self {
            id: model.id.clone(),
            name: model.name.clone(),
            model_id: model.model_id.clone(),
            description: model.description.clone(),
            api_provider: model.api_provider.clone(),
            provider: model.provider.clone(),
            type_: ModelType::from_db_str(&model.type_),
            streaming: model.streaming,
            image_input: model.image_input,
            max_input_tokens: model.max_input_tokens,
            tools: parse_string_list(&model.tools),
            features: parse_string_list(&model.features),
            custom_settings: model
                .custom_settings
                .as_ref()
                .and_then(|s| serde_json::from_str::<CustomModelSettings>(s).ok()),
            is_active: model.is_active,
            is_custom: model.is_custom,
            user,
            created_at: model.created_at,
            updated_at: model.updated_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct GqlModelsList {
    pub models: Vec<GqlModel>,
    pub providers: Vec<GqlProviderInfo>,
    pub total: Option<i32>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct GqlProviderInfo {
    pub id: String,
    pub name: String,
    pub is_connected: bool,
    pub costs_info_available: bool,
    pub details: Vec<ProviderDetail>,
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct ProviderDetail {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct UpdateModelStatusInput {
    pub model_id: String,
    pub is_active: bool,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct CreateCustomModelInput {
    pub name: String,
    pub model_id: String,
    pub description: Option<String>,
    pub endpoint: String,
    pub api_key: Option<String>,
    /// Provider-side model identifier sent to the API.
    pub model_name: String,
    #[graphql(name = "type", default_with = "ModelType::Chat")]
    pub type_: ModelType,
    pub protocol: String,
    pub streaming: Option<bool>,
    pub image_input: Option<bool>,
    pub max_input_tokens: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct UpdateCustomModelInput {
    pub id: String,
    pub name: String,
    pub model_id: String,
    pub description: Option<String>,
    pub endpoint: String,
    pub api_key: Option<String>,
    pub model_name: String,
    #[graphql(name = "type", default_with = "ModelType::Chat")]
    pub type_: ModelType,
    pub protocol: String,
    pub streaming: Option<bool>,
    pub image_input: Option<bool>,
    pub max_input_tokens: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct DeleteModelInput {
    pub id: String,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct TestCustomModelInput {
    pub endpoint: String,
    pub api_key: Option<String>,
    pub model_id: Option<String>,
    pub model_name: String,
    #[graphql(name = "type", default_with = "ModelType::Chat")]
    pub type_: ModelType,
    pub protocol: String,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct TestModelInput {
    pub id: String,
    #[graphql(default = "2+2=")]
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct GqlCostsInfo {
    pub start: DateTime<Utc>,
    pub end: Option<DateTime<Utc>>,
    pub costs: Vec<GqlServiceCostInfo>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct GqlServiceCostInfo {
    pub name: String,
    pub r#type: String,
    pub amounts: Vec<GqlAmount>,
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct GqlAmount {
    pub amount: f64,
    pub currency: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_type_round_trips_db_values() {
        for (s, t) in [
            ("chat", ModelType::Chat),
            ("embedding", ModelType::Embedding),
            ("image_generation", ModelType::ImageGeneration),
        ] {
            assert_eq!(ModelType::from_db_str(s), t);
            assert_eq!(t.as_db_str(), s);
        }
        assert_eq!(ModelType::from_db_str("garbage"), ModelType::Other);
    }

    #[test]
    fn parses_json_and_comma_separated_lists() {
        assert_eq!(
            parse_string_list(&Some(r#"["WEB_SEARCH","MCP"]"#.to_string())),
            Some(vec!["WEB_SEARCH".to_string(), "MCP".to_string()])
        );
        assert_eq!(
            parse_string_list(&Some("WEB_SEARCH,MCP".to_string())),
            Some(vec!["WEB_SEARCH".to_string(), "MCP".to_string()])
        );
        assert_eq!(parse_string_list(&Some("".to_string())), None);
        assert_eq!(parse_string_list(&None), None);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Insertable)]
#[diesel(table_name = models)]
pub struct NewModel {
    pub id: String,
    pub name: String,
    pub model_id: String,
    pub description: Option<String>,
    pub user_id: Option<String>,
    pub provider: Option<String>,
    pub api_provider: String,
    pub type_: String,
    pub streaming: bool,
    pub image_input: bool,
    pub max_input_tokens: Option<i32>,
    pub tools: Option<String>,
    pub features: Option<String>,
    pub custom_settings: Option<String>,
    pub is_active: bool,
    pub is_custom: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}
