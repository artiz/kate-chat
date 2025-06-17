use diesel::prelude::*;
use async_graphql::{Context, Object, Result, InputObject};

use crate::models::*;
use crate::graphql::GraphQLContext;
use crate::schema::*;
use crate::utils::errors::AppError;

#[derive(Default)]
pub struct Query;

#[derive(InputObject)]
pub struct GetChatsInput {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
    pub search_term: Option<String>,
}

#[derive(InputObject)]
pub struct GetMessagesInput {
    pub chat_id: String,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

#[derive(InputObject)]
pub struct GetCostsInput {
    pub start_time: i64,
    pub end_time: Option<i64>,
}

#[derive(async_graphql::SimpleObject)]
pub struct ApplicationConfig {
    pub demo_mode: bool,
    pub max_chat_messages: i32,
    pub max_chats: i32,
    pub max_images: i32,
    pub s3_connected: bool,
}


#[Object]

impl Query {
    /// Get current authenticated user
    async fn current_user(&self, ctx: &Context<'_>) -> Result<Option<User>> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        Ok(gql_ctx.user.clone())
    }

    /// Get application configuration
    async fn app_config(&self, ctx: &Context<'_>) -> Result<ApplicationConfig> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let config = &gql_ctx.config;
        
        Ok(ApplicationConfig {
            demo_mode: config.demo_mode,
            max_chat_messages: config.demo_max_chat_messages.unwrap_or(-1),
            max_chats: config.demo_max_chats.unwrap_or(-1),
            max_images: config.demo_max_images.unwrap_or(-1),
            s3_connected: config.s3_bucket.is_some(),
        })
    }

    /// Get all chats for the current user
    async fn get_chats(&self, ctx: &Context<'_>, input: Option<GetChatsInput>) -> Result<GqlChatsList> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get().map_err(|e| AppError::Database(e.to_string()))?;

        let input = input.unwrap_or(GetChatsInput {
            limit: Some(20),
            offset: Some(0),
            search_term: None,
        });

        let limit = input.limit.unwrap_or(20);
        let offset = input.offset.unwrap_or(0);

        let mut query = chats::table
            .filter(chats::user_id.eq(&user.id))
            .order(chats::updated_at.desc())
            .limit(limit as i64)
            .offset(offset as i64)
            .into_boxed();

        if let Some(search_term) = &input.search_term {
            query = query.filter(
                chats::title.like(format!("%{}%", search_term))
                    .or(chats::description.like(format!("%{}%", search_term)))
            );
        }

        let chats_result: Vec<Chat> = query
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let total_query = chats::table
            .filter(chats::user_id.eq(&user.id))
            .count();

        let total: i64 = total_query
            .get_result(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(GqlChatsList {
            chats: chats_result,
            total: Some(total as i32),
            has_more: (offset + limit) < total as i32,
            error: None,
        })
    }

    /// Get chat by ID
    async fn get_chat_by_id(&self, ctx: &Context<'_>, id: String) -> Result<Option<Chat>> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get().map_err(|e| AppError::Database(e.to_string()))?;

        let chat_result: Option<Chat> = chats::table
            .filter(chats::id.eq(&id))
            .filter(chats::user_id.eq(&user.id))
            .first(&mut conn)
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(chat_result)
    }

    /// Get messages for a chat
    async fn get_chat_messages(&self, ctx: &Context<'_>, input: GetMessagesInput) -> Result<GqlMessagesList> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get().map_err(|e| AppError::Database(e.to_string()))?;

        // First verify the chat belongs to the user
        let chat: Option<Chat> = chats::table
            .filter(chats::id.eq(&input.chat_id))
            .filter(chats::user_id.eq(&user.id))
            .first(&mut conn)
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;

        if chat.is_none() {
            return Ok(GqlMessagesList {
                messages: vec![],
                chat: None,
                total: Some(0),
                has_more: false,
                error: Some("Chat not found".to_string()),
            });
        }

        let limit = input.limit.unwrap_or(20);
        let offset = input.offset.unwrap_or(0);

        let messages_result: Vec<Message> = messages::table
            .filter(messages::chat_id.eq(&input.chat_id))
            .order(messages::created_at.asc())
            .limit(limit as i64)
            .offset(offset as i64)
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let total: i64 = messages::table
            .filter(messages::chat_id.eq(&input.chat_id))
            .count()
            .get_result(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(GqlMessagesList {
            messages: messages_result,
            chat,
            total: Some(total as i32),
            has_more: (offset + limit) < total as i32,
            error: None,
        })
    }

    /// Get message by ID
    async fn get_message_by_id(&self, ctx: &Context<'_>, id: String) -> Result<Option<Message>> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get().map_err(|e| AppError::Database(e.to_string()))?;

        let message_result: Option<Message> = messages::table
            .filter(messages::id.eq(&id))
            .filter(messages::user_id.eq(&user.id))
            .first(&mut conn)
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(message_result)
    }

    /// Get all models
    async fn get_models(&self, ctx: &Context<'_>) -> Result<GqlModelsList> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get().map_err(|e| AppError::Database(e.to_string()))?;

        let models_result: Vec<Model> = models::table
            .filter(models::user_id.eq(&user.id))
            .order(models::name.asc())
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Get provider information from AI service
        let ai_service = crate::services::ai::AIService::new(gql_ctx.config.clone());
        let provider_info = ai_service.get_provider_info(false).await
            .map_err(|e| AppError::Internal(format!("Failed to get provider info: {}", e)))?;

        let providers: Vec<GqlProviderInfo> = provider_info
            .into_iter()
            .map(|info| GqlProviderInfo {
                id: info.id,
                name: info.name,
                is_connected: info.is_connected,
                costs_info_available: info.costs_info_available,
                details: info.details
                    .into_iter()
                    .map(|(key, value)| ProviderDetail { key, value })
                    .collect(),
            })
            .collect();

        // If no models in database, auto-reload from API providers
        if models_result.is_empty() {
            // Use the reload_models logic from mutation
            return self.refresh_models_for_query(gql_ctx, &user, ai_service, providers).await;
        }

        let gql_models: Vec<GqlModel> = models_result
            .into_iter()
            .map(|model| GqlModel {
                id: model.id,
                name: model.name,
                description: model.description,
                model_id: model.model_id,
                api_provider: model.api_provider,
                provider: model.provider,
                is_active: model.is_active,
                is_custom: model.is_custom,
                supports_text_in: model.supports_text_in,
                supports_text_out: model.supports_text_out,
                supports_image_in: model.supports_image_in,
                supports_image_out: model.supports_image_out,
                supports_embeddings_in: model.supports_embeddings_in,
                supports_embeddings_out: model.supports_embeddings_out,
                supports_streaming: model.supports_streaming,
                user: user.clone(),
                created_at: model.created_at,
                updated_at: model.updated_at,
            })
            .collect();

        let total_count = gql_models.len() as i32;
        Ok(GqlModelsList {
            models: gql_models,
            providers,
            total: Some(total_count),
            error: None,
        })
    }

    /// Get active models only
    async fn get_active_models(&self, ctx: &Context<'_>) -> Result<Vec<GqlModel>> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get().map_err(|e| AppError::Database(e.to_string()))?;

        let models_result: Vec<Model> = models::table
            .filter(models::user_id.eq(&user.id))
            .filter(models::is_active.eq(true))
            .order(models::name.asc())
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let gql_models: Vec<GqlModel> = models_result
            .into_iter()
            .map(|model| GqlModel {
                id: model.id,
                name: model.name,
                description: model.description,
                model_id: model.model_id,
                api_provider: model.api_provider,
                provider: model.provider,
                is_active: model.is_active,
                is_custom: model.is_custom,
                supports_text_in: model.supports_text_in,
                supports_text_out: model.supports_text_out,
                supports_image_in: model.supports_image_in,
                supports_image_out: model.supports_image_out,
                supports_embeddings_in: model.supports_embeddings_in,
                supports_embeddings_out: model.supports_embeddings_out,
                supports_streaming: model.supports_streaming,
                user: user.clone(),
                created_at: model.created_at,
                updated_at: model.updated_at,
            })
            .collect();

        Ok(gql_models)
    }

    /// Get costs information
    async fn get_costs(&self, _ctx: &Context<'_>, input: GetCostsInput) -> Result<GqlCostsInfo> {
        // TODO: Implement actual costs retrieval from AWS
        Ok(GqlCostsInfo {
            start: chrono::DateTime::from_timestamp(input.start_time, 0)
                .unwrap_or_default(),
            end: input.end_time.and_then(|t| chrono::DateTime::from_timestamp(t, 0)),
            costs: vec![],
            error: None,
        })
    }

    /// Refresh JWT token
    async fn refresh_token(&self, ctx: &Context<'_>) -> Result<AuthResponse> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;

        let token = crate::utils::jwt::create_token(&user.id, &gql_ctx.config.jwt_secret)?;

        Ok(AuthResponse {
            token,
            user: user.clone(),
        })
    }
}


impl Query {
    // TODO: extract this logic to a service or utility function and reuse it in mutations
    // Helper method to refresh models when database is empty
    async fn refresh_models_for_query(
        &self,
        gql_ctx: &GraphQLContext,
        user: &User,
        ai_service: crate::services::ai::AIService,
        providers: Vec<GqlProviderInfo>,
    ) -> Result<GqlModelsList> {
        let mut conn = gql_ctx.db_pool.get().map_err(|e| AppError::Database(e.to_string()))?;
        
        // Get all models from enabled providers
        let all_models = ai_service.get_all_models().await
            .map_err(|e| AppError::Internal(format!("Failed to get models from AI providers: {}", e)))?;
        
        let mut gql_models = Vec::new();
        
        // Save new models to database
        for (model_id, model_info) in all_models {
            let new_model = NewModel {
                id: uuid::Uuid::new_v4().to_string(),
                name: model_info.name.clone(),
                description: model_info.description.clone(),
                model_id: model_id.clone(),
                api_provider: model_info.api_provider.to_string(),
                provider: model_info.provider.clone(),
                is_active: true, // New models are active by default
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
            
            gql_models.push(GqlModel {
                id: saved_model.id,
                name: saved_model.name,
                description: saved_model.description,
                model_id: saved_model.model_id,
                api_provider: saved_model.api_provider,
                provider: saved_model.provider,
                is_active: saved_model.is_active,
                is_custom: saved_model.is_custom,
                supports_text_in: saved_model.supports_text_in,
                supports_text_out: saved_model.supports_text_out,
                supports_image_in: saved_model.supports_image_in,
                supports_image_out: saved_model.supports_image_out,
                supports_embeddings_in: saved_model.supports_embeddings_in,
                supports_embeddings_out: saved_model.supports_embeddings_out,
                supports_streaming: saved_model.supports_streaming,
                user: user.clone(),
                created_at: saved_model.created_at,
                updated_at: saved_model.updated_at,
            });
        }
        
        let total_count = gql_models.len() as i32;
        Ok(GqlModelsList {
            models: gql_models,
            providers,
            total: Some(total_count),
            error: None,
        })
    }
}
