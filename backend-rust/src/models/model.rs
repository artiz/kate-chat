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
    pub description: String,
    pub model_id: String,
    pub api_provider: String,
    pub provider: Option<String>,
    pub is_active: bool,
    pub is_custom: bool,
    pub supports_text_in: bool,
    pub supports_text_out: bool,
    pub supports_image_in: bool,
    pub supports_image_out: bool,
    pub supports_embeddings_in: bool,
    pub supports_embeddings_out: bool,
    pub supports_streaming: bool,
    pub user_id: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl Model {
    pub fn new(
        name: String,
        description: String,
        model_id: String,
        api_provider: String,
        user_id: String,
    ) -> Self {
        let now = Utc::now().naive_utc();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            description,
            model_id,
            api_provider,
            provider: None,
            is_active: true,
            is_custom: false,
            supports_text_in: true,
            supports_text_out: true,
            supports_image_in: false,
            supports_image_out: false,
            supports_embeddings_in: false,
            supports_embeddings_out: false,
            supports_streaming: true,
            user_id,
            created_at: now,
            updated_at: now,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct GqlModel {
    pub id: String,
    pub name: String,
    pub description: String,
    pub model_id: String,
    pub api_provider: String,
    pub provider: Option<String>,
    pub is_active: bool,
    pub is_custom: bool,
    pub supports_text_in: bool,
    pub supports_text_out: bool,
    pub supports_image_in: bool,
    pub supports_image_out: bool,
    pub supports_embeddings_in: bool,
    pub supports_embeddings_out: bool,
    pub supports_streaming: bool,
    pub user: User,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl GqlModel {
    pub fn from_model(model: &Model, user: User) -> Self {
        Self {
            id: model.id.clone(),
            name: model.name.clone(),
            description: model.description.clone(),
            model_id: model.model_id.clone(),
            api_provider: model.api_provider.clone(),
            provider: model.provider.clone(),
            is_active: model.is_active,
            is_custom: model.is_custom,
            supports_text_in: model.supports_text_in,
            supports_text_out: model.supports_text_out,
            supports_image_in: model.supports_image_in,
            supports_image_out: model.supports_image_out,
            supports_embeddings_in: model.supports_embeddings_in,
            supports_embeddings_out: model.supports_embeddings_out,
            supports_streaming: model.supports_streaming,
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
    pub description: String,
    pub model_id: String,
    pub api_provider: String,
    pub provider: Option<String>,
    pub is_active: bool,
    pub is_custom: bool,
    pub supports_text_in: bool,
    pub supports_text_out: bool,
    pub supports_image_in: bool,
    pub supports_image_out: bool,
    pub supports_embeddings_in: bool,
    pub supports_embeddings_out: bool,
    pub supports_streaming: bool,
    pub user_id: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}
