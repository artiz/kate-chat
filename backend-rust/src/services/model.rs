use diesel::prelude::*;

use crate::database::DbPool;
use crate::models::{GqlModel, Model, NewModel, User};
use crate::schema::models;
use crate::services::ai::AIService;
use crate::utils::errors::AppError;

pub struct ModelService<'a> {
    db_pool: &'a DbPool,
    ai_service: &'a AIService,
}

impl<'a> ModelService<'a> {
    pub fn new(db_pool: &'a DbPool, ai_service: &'a AIService) -> Self {
        Self {
            db_pool,
            ai_service,
        }
    }

    pub async fn refresh_models(&self, user: &User) -> Result<Vec<GqlModel>, AppError> {
        let mut conn = self
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Get all models from enabled providers
        let all_models = self.ai_service.get_all_models().await.map_err(|e| {
            AppError::Internal(format!("Failed to get models from AI providers: {}", e))
        })?;

        // Get existing models for user to preserve isActive status
        let existing_models: Vec<Model> = models::table
            .filter(models::user_id.eq(&user.id))
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let enabled_map: std::collections::HashMap<String, bool> = existing_models
            .iter()
            .map(|m| (m.model_id.clone(), m.is_active))
            .collect();

        // Clear existing non-custom models for this user
        if !all_models.is_empty() {
            diesel::delete(
                models::table
                    .filter(models::user_id.eq(&user.id))
                    .filter(models::is_custom.eq(false)),
            )
            .execute(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        let mut gql_models = Vec::new();

        // Save new models to database
        for (model_id, model_info) in all_models {
            let is_active = enabled_map.get(&model_id).copied().unwrap_or(true);

            let new_model = NewModel {
                id: uuid::Uuid::new_v4().to_string(),
                name: model_info.name.clone(),
                description: model_info.description.clone(),
                model_id: model_id.clone(),
                api_provider: model_info.api_provider.to_string(),
                provider: model_info.provider.clone(),
                is_active,
                is_custom: false,
                supports_text_in: model_info.supports_text_in,
                supports_text_out: model_info.supports_text_out,
                supports_image_in: model_info.supports_image_in,
                supports_image_out: model_info.supports_image_out,
                supports_embeddings_in: model_info.supports_embeddings_in,
                supports_embeddings_out: model_info.supports_embeddings_out,
                supports_streaming: model_info.supports_streaming,
                user_id: user.id.clone(),
                created_at: chrono::Utc::now().naive_utc(),
                updated_at: chrono::Utc::now().naive_utc(),
            };

            diesel::insert_into(models::table)
                .values(&new_model)
                .execute(&mut conn)
                .map_err(|e| AppError::Database(e.to_string()))?;

            let saved_model: Model = models::table
                .filter(models::id.eq(&new_model.id))
                .first(&mut conn)
                .map_err(|e| AppError::Database(e.to_string()))?;

            gql_models.push(GqlModel::from_model(&saved_model, user.clone()));
        }

        Ok(gql_models)
    }
}
