use async_graphql::{Context, InputObject, Object, Result};
use diesel::prelude::*;

use crate::graphql::GraphQLContext;
use crate::models::{
    AuthResponse, Chat, GqlAmount, GqlChat, GqlChatsList, GqlCostsInfo, GqlMessage,
    GqlMessagesList, GqlModel, GqlModelsList, GqlProviderInfo, GqlServiceCostInfo, Message, Model,
    ProviderDetail, User,
};
use crate::schema::{chats, messages, models};
use crate::services::ai::ApiProvider;
use crate::services::chat::{ChatService, GetChatStatsResult};
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
    pub api_provider: String,
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
    async fn get_chats(
        &self,
        ctx: &Context<'_>,
        input: Option<GetChatsInput>,
    ) -> Result<GqlChatsList> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let input = input.unwrap_or(GetChatsInput {
            limit: Some(20),
            offset: Some(0),
            search_term: None,
        });

        let limit = input.limit.unwrap_or(20);
        let offset = input.offset.unwrap_or(0);
        let chat_service: ChatService = ChatService::new(&gql_ctx.db_pool);

        let GetChatStatsResult { chats, total } = chat_service.get_chats_with_stats(
            limit,
            offset,
            input.search_term.clone(),
            user.id.clone(),
            None,
        )?;

        Ok(GqlChatsList {
            chats: chats.into_iter().map(GqlChat::from).collect(),
            total: Some(total as i32),
            has_more: (offset + limit) < total as i32,
            error: None,
        })
    }

    /// Get chat by ID
    async fn get_chat_by_id(&self, ctx: &Context<'_>, id: String) -> Result<Option<Chat>> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let chat_result: Option<Chat> = chats::table
            .filter(chats::id.eq(&id))
            .filter(chats::user_id.eq(&user.id))
            .first(&mut conn)
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(chat_result)
    }

    /// Get messages for a chat
    async fn get_chat_messages(
        &self,
        ctx: &Context<'_>,
        input: GetMessagesInput,
    ) -> Result<GqlMessagesList> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let chat_service: ChatService = ChatService::new(&gql_ctx.db_pool);
        let GetChatStatsResult { chats, total: _ } = chat_service.get_chats_with_stats(
            1,
            0,
            None,
            user.id.clone(),
            Some(input.chat_id.clone()),
        )?;

        if chats.is_empty() {
            return Err(AppError::NotFound("Chat not found".to_string()).into());
        }

        // First verify the chat belongs to the user
        let chat = chats.into_iter().next();

        let limit = input.limit.unwrap_or(20);
        let offset = input.offset.unwrap_or(0);
        let messages_result: Vec<Message> = messages::table
            .filter(messages::chat_id.eq(&input.chat_id))
            .order(messages::created_at.asc())
            .limit(i64::from(limit))
            .offset(i64::from(offset))
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let total: i64 = messages::table
            .filter(messages::chat_id.eq(&input.chat_id))
            .count()
            .get_result(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(GqlMessagesList {
            messages: messages_result.into_iter().map(GqlMessage::from).collect(),
            chat: chat.map(GqlChat::from),
            total: Some(total as i32),
            has_more: (offset + limit) < total as i32,
            error: None,
        })
    }

    /// Get message by ID
    async fn get_message_by_id(&self, ctx: &Context<'_>, id: String) -> Result<Option<GqlMessage>> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let message_result: Option<Message> = messages::table
            .filter(messages::id.eq(&id))
            .filter(messages::user_id.eq(&user.id))
            .first(&mut conn)
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(message_result.map(GqlMessage::from))
    }

    /// Get all models
    async fn get_models(&self, ctx: &Context<'_>) -> Result<GqlModelsList> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let models_result: Vec<Model> = models::table
            .filter(models::user_id.eq(&user.id))
            .order(models::name.asc())
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Get provider information from AI service
        let ai_service = crate::services::ai::AIService::new(gql_ctx.config.clone());
        let provider_info = ai_service
            .get_provider_info(false)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to get provider info: {}", e)))?;

        let providers: Vec<GqlProviderInfo> = provider_info
            .into_iter()
            .map(|info| GqlProviderInfo {
                id: info.id,
                name: info.name,
                is_connected: info.is_connected,
                costs_info_available: info.costs_info_available,
                details: info
                    .details
                    .into_iter()
                    .map(|(key, value)| ProviderDetail { key, value })
                    .collect(),
            })
            .collect();

        // If no models in database, auto-reload from API providers
        let mut gql_models: Vec<GqlModel> = models_result
            .into_iter()
            .map(|model| GqlModel::from_model(&model, user.clone()))
            .collect();

        if gql_models.is_empty() {
            let models_service =
                crate::services::model::ModelService::new(&gql_ctx.db_pool, &ai_service);
            // Use the reload_models logic from mutation
            gql_models.extend(models_service.refresh_models(user).await?);
        }

        let total_count = gql_models.len().min(i32::MAX as usize) as i32;
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
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let models_result: Vec<Model> = models::table
            .filter(models::user_id.eq(&user.id))
            .filter(models::is_active.eq(true))
            .order(models::name.asc())
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let gql_models: Vec<GqlModel> = models_result
            .into_iter()
            .map(|model| GqlModel::from_model(&model, user.clone()))
            .collect();

        Ok(gql_models)
    }

    /// Get costs information
    async fn get_costs(&self, ctx: &Context<'_>, input: GetCostsInput) -> Result<GqlCostsInfo> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let ai_service = crate::services::ai::AIService::new(gql_ctx.config.clone());

        let costs_info = ai_service
            .get_costs(
                ApiProvider::from(input.api_provider),
                input.start_time,
                input.end_time,
            )
            .await
            .map_err(|e| AppError::Internal(format!("Failed to get costs info: {}", e)))?;

        // Convert costs_info to GqlCostsInfo format
        let gql_costs: Vec<GqlServiceCostInfo> = costs_info
            .costs
            .into_iter()
            .map(|service_cost| GqlServiceCostInfo {
                name: service_cost.name,
                r#type: service_cost.r#type,
                amounts: service_cost
                    .amounts
                    .into_iter()
                    .map(|amount| GqlAmount {
                        amount: amount.amount,
                        currency: amount.currency,
                    })
                    .collect(),
            })
            .collect();

        Ok(GqlCostsInfo {
            start: costs_info.start,
            end: costs_info.end,
            costs: gql_costs,
            error: costs_info.error,
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
