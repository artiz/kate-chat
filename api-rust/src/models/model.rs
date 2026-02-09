use async_graphql::{InputObject, SimpleObject};
use chrono::{DateTime, NaiveDateTime, Utc};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::User;
use crate::schema::models;

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
    pub type_: String,
    pub streaming: bool,
    pub image_input: bool,
    pub max_input_tokens: Option<i32>,
    pub tools: Option<String>,
    pub features: Option<String>,
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
            type_: model.type_.clone(),
            streaming: model.streaming,
            image_input: model.image_input,
            max_input_tokens: model.max_input_tokens,
            tools: model.tools.clone(),
            features: model.features.clone(),
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
