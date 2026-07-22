use async_graphql::{Context, InputObject, Object, Result, SimpleObject};
use diesel::prelude::*;

use crate::graphql::GraphQLContext;
use crate::models::chat_file::{
    file_url, GetChatFilesInput, GetImagesInput, GqlChatFile, GqlChatFilesList, GqlImage,
    GqlImagesList, CHAT_FILE_TYPE_IMAGE, CHAT_FILE_TYPE_INLINE_DOCUMENT,
};
use crate::models::{
    AuthResponse, Chat, ChatFile, GqlAmount, GqlChat, GqlChatsList, GqlCostsInfo, GqlMessage,
    GqlMessagesList, GqlModel, GqlModelsList, GqlProviderInfo, GqlServiceCostInfo, Message, Model,
    ProviderDetail, User, ROLE_ADMIN,
};
use crate::schema::{chat_files, chats, messages, models, users};
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
    pub pinned: Option<bool>,
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

#[derive(InputObject, Default)]
pub struct GetUsersInput {
    #[graphql(default = 0)]
    pub offset: i32,
    #[graphql(default = 20)]
    pub limit: i32,
    pub search_term: Option<String>,
}

#[derive(SimpleObject)]
pub struct AdminStatsResponse {
    pub users_count: i64,
    pub chats_count: i64,
    pub models_count: i64,
}

#[derive(SimpleObject)]
pub struct AdminUsersResponse {
    pub users: Vec<User>,
    pub total: i64,
    pub has_more: bool,
}

#[derive(async_graphql::SimpleObject)]
pub struct ApplicationConfig {
    pub current_user: Option<User>,
    pub demo_mode: bool,
    pub max_chat_messages: i32,
    pub max_chats: i32,
    pub max_images: i32,
    pub rag_enabled: Option<bool>,
    pub rag_supported: Option<bool>,
    pub s3_connected: bool,
    pub token: Option<String>,
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

        let user = gql_ctx.user.clone();
        let token = if let Some(ref u) = user {
            crate::utils::jwt::create_token(&u.id, &config.jwt_secret).ok()
        } else {
            None
        };

        Ok(ApplicationConfig {
            current_user: user,
            demo_mode: config.demo_mode,
            max_chat_messages: config.demo_max_chat_messages.unwrap_or(-1),
            max_chats: config.demo_max_chats.unwrap_or(-1),
            max_images: config.demo_max_images.unwrap_or(-1),
            rag_enabled: Some(false),
            rag_supported: Some(false),
            s3_connected: config.s3_bucket.is_some(),
            token,
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
            pinned: None,
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

        let has_more = (offset + limit) < total as i32;
        let next = if has_more {
            Some((offset + limit) as f64)
        } else {
            None
        };

        Ok(GqlChatsList {
            chats: chats.into_iter().map(GqlChat::from).collect(),
            total: Some(total as i32),
            next,
            error: None,
        })
    }

    /// Find the most recent pristine chat for the current user
    async fn find_pristine_chat(&self, ctx: &Context<'_>) -> Result<Option<GqlChat>> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let chat_result: Option<Chat> = chats::table
            .filter(chats::user_id.eq(&user.id))
            .filter(chats::is_pristine.eq(true))
            .order(chats::updated_at.desc())
            .first(&mut conn)
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(chat_result.map(GqlChat::from))
    }

    /// Get chat by ID
    async fn get_chat_by_id(&self, ctx: &Context<'_>, id: String) -> Result<Option<GqlChat>> {
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

        Ok(chat_result.map(GqlChat::from))
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

    /// Library: all generated/uploaded images of the current user
    async fn get_all_images(
        &self,
        ctx: &Context<'_>,
        input: GetImagesInput,
    ) -> Result<GqlImagesList> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let offset = input.offset.max(0) as i64;
        let limit = input.limit.clamp(1, 200) as i64;

        let rows: Vec<(ChatFile, Chat, Option<Message>)> = chat_files::table
            .inner_join(chats::table)
            .left_join(messages::table)
            .filter(chats::user_id.eq(&user.id))
            .filter(chat_files::type_.eq(CHAT_FILE_TYPE_IMAGE))
            .order(chat_files::created_at.desc())
            .offset(offset)
            .limit(limit + 1)
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let has_more = rows.len() as i64 > limit;
        let images = rows
            .into_iter()
            .take(limit as usize)
            .filter_map(|(file, chat, message)| {
                let file_name = file.file_name?;
                Some(GqlImage {
                    id: file.id,
                    file_url: file_url(&file_name),
                    file_name,
                    mime: file.mime,
                    predominant_color: file.predominant_color,
                    role: message
                        .as_ref()
                        .map(|m| m.role.clone())
                        .or(Some("assistant".to_string())),
                    created_at: file.created_at,
                    message: message.map(GqlMessage::from),
                    chat: Some(GqlChat::from(chat)),
                })
            })
            .collect();

        Ok(GqlImagesList {
            images,
            next_page: has_more.then_some((offset + limit) as i32),
            error: None,
        })
    }

    /// Library: chat files (inline chat-context documents by default)
    async fn get_chat_files(
        &self,
        ctx: &Context<'_>,
        input: GetChatFilesInput,
    ) -> Result<GqlChatFilesList> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let offset = input.offset.max(0) as i64;
        let limit = input.limit.clamp(1, 200) as i64;
        let types = input
            .types
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| vec![CHAT_FILE_TYPE_INLINE_DOCUMENT.to_string()]);

        let rows: Vec<(ChatFile, Chat, Option<Message>)> = chat_files::table
            .inner_join(chats::table)
            .left_join(messages::table)
            .filter(chats::user_id.eq(&user.id))
            .filter(chat_files::type_.eq_any(&types))
            .order(chat_files::created_at.desc())
            .offset(offset)
            .limit(limit + 1)
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let has_more = rows.len() as i64 > limit;
        let files = rows
            .into_iter()
            .take(limit as usize)
            .map(|(file, chat, message)| GqlChatFile {
                id: file.id,
                file_url: file.file_name.as_deref().map(file_url),
                file_name: file.file_name,
                type_: file.type_,
                mime: file.mime,
                upload_file: file.upload_file,
                role: message
                    .as_ref()
                    .map(|m| m.role.clone())
                    .or(Some("user".to_string())),
                created_at: file.created_at,
                message: message.map(GqlMessage::from),
                chat: Some(GqlChat::from(chat)),
            })
            .collect();

        Ok(GqlChatFilesList {
            files,
            next_page: has_more.then_some((offset + limit) as i32),
            error: None,
        })
    }

    /// Admin: global usage stats
    async fn get_admin_stats(&self, ctx: &Context<'_>) -> Result<AdminStatsResponse> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        if user.role != ROLE_ADMIN {
            return Err(async_graphql::Error::new("Access denied"));
        }
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let users_count: i64 = users::table
            .count()
            .get_result(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;
        let chats_count: i64 = chats::table
            .count()
            .get_result(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;
        let models_count: i64 = models::table
            .count()
            .get_result(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(AdminStatsResponse {
            users_count,
            chats_count,
            models_count,
        })
    }

    /// Admin: paginated user list with optional search
    async fn get_users(
        &self,
        ctx: &Context<'_>,
        input: Option<GetUsersInput>,
    ) -> Result<AdminUsersResponse> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        if user.role != ROLE_ADMIN {
            return Err(async_graphql::Error::new("Access denied"));
        }
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let input = input.unwrap_or_default();
        let offset = input.offset.max(0) as i64;
        let limit = input.limit.clamp(1, 100) as i64;

        let mut count_query = users::table.into_boxed();
        let mut list_query = users::table.into_boxed();
        if let Some(term) = input
            .search_term
            .as_deref()
            .map(str::trim)
            .filter(|t| !t.is_empty())
        {
            let pattern = format!("%{}%", term);
            count_query = count_query.filter(
                users::email
                    .like(pattern.clone())
                    .or(users::first_name.like(pattern.clone()))
                    .or(users::last_name.like(pattern.clone())),
            );
            list_query = list_query.filter(
                users::email
                    .like(pattern.clone())
                    .or(users::first_name.like(pattern.clone()))
                    .or(users::last_name.like(pattern)),
            );
        }

        let total: i64 = count_query
            .count()
            .get_result(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let users_list: Vec<User> = list_query
            .order(users::created_at.desc())
            .offset(offset)
            .limit(limit)
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let has_more = offset + (users_list.len() as i64) < total;

        Ok(AdminUsersResponse {
            users: users_list,
            total,
            has_more,
        })
    }
}
