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
use crate::schema::{chat_files, chat_folders, chats, messages, models, users};
use crate::services::ai::ApiProvider;
use crate::services::chat::{ChatService, GetChatStatsResult};
use crate::utils::errors::AppError;

#[derive(Default)]
pub struct Query;

#[derive(InputObject)]
pub struct GetChatsInput {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
    /// Node API name for `offset`
    pub from: Option<i32>,
    pub search_term: Option<String>,
    pub pinned: Option<bool>,
    pub folder_id: Option<String>,
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

#[derive(SimpleObject)]
pub struct GqlCredentialSource {
    #[graphql(name = "type")]
    pub type_: Option<String>,
    pub source: Option<String>,
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
    pub mcp_enabled: Option<bool>,
    pub s3_connected: bool,
    pub token: Option<String>,
    pub credentials_source: Vec<GqlCredentialSource>,
    pub reasoning_min_token_budget: Option<i32>,
    pub reasoning_max_token_budget: Option<i32>,
    pub context_messages_limit: Option<i32>,
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

        let settings = user.as_ref().and_then(|u| u.settings.as_ref());
        let effective = config.with_user_settings(settings);
        let s3_connected = effective.s3_bucket.is_some();

        // credential source per provider: profile settings (DATABASE) win
        // over environment, mirroring the Node resolver
        let has = |v: &Option<String>| v.as_deref().is_some_and(|s| !s.trim().is_empty());
        let source_for = |from_settings: bool| {
            Some(
                if from_settings {
                    "DATABASE"
                } else {
                    "ENVIRONMENT"
                }
                .to_string(),
            )
        };

        let mut credentials_source = Vec::new();
        if s3_connected {
            credentials_source.push(GqlCredentialSource {
                type_: Some("S3".to_string()),
                source: source_for(
                    settings
                        .is_some_and(|s| has(&s.s3_access_key_id) || has(&s.s3_files_bucket_name)),
                ),
            });
        }
        for provider in &config.enabled_api_providers {
            let from_settings = match provider.as_str() {
                "OPEN_AI" => settings.is_some_and(|s| has(&s.openai_api_key)),
                "YANDEX_AI" => settings.is_some_and(|s| has(&s.yandex_fm_api_key)),
                "AWS_BEDROCK" => settings.is_some_and(|s| {
                    has(&s.aws_bedrock_access_key_id) || has(&s.aws_bedrock_profile)
                }),
                _ => false,
            };
            credentials_source.push(GqlCredentialSource {
                type_: Some(provider.clone()),
                source: source_for(from_settings),
            });
        }

        Ok(ApplicationConfig {
            current_user: user,
            demo_mode: config.demo_mode,
            max_chat_messages: config.demo_max_chat_messages.unwrap_or(-1),
            max_chats: config.demo_max_chats.unwrap_or(-1),
            max_images: config.demo_max_images.unwrap_or(-1),
            rag_enabled: Some(false),
            rag_supported: Some(false),
            mcp_enabled: Some(true),
            s3_connected,
            token,
            credentials_source,
            reasoning_min_token_budget: Some(1024),
            reasoning_max_token_budget: Some(16_000),
            context_messages_limit: Some(100),
        })
    }

    /// Chat folders (sidebar tree)
    async fn get_folders(
        &self,
        ctx: &Context<'_>,
        #[graphql(name = "topLevelOnly")] top_level_only: Option<bool>,
    ) -> Result<crate::models::GqlFoldersList> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get()?;

        let mut query = chat_folders::table
            .filter(chat_folders::user_id.eq(&user.id))
            .into_boxed();
        if top_level_only.unwrap_or(false) {
            query = query.filter(chat_folders::parent_id.is_null());
        }
        let folders: Vec<crate::models::ChatFolder> = query
            .order(chat_folders::created_at.asc())
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(crate::models::GqlFoldersList {
            folders: folders.into_iter().map(Into::into).collect(),
            error: None,
        })
    }

    /// Full folder tree (folders page)
    async fn get_all_folders(&self, ctx: &Context<'_>) -> Result<crate::models::GqlFoldersList> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get()?;

        let folders: Vec<crate::models::ChatFolder> = chat_folders::table
            .filter(chat_folders::user_id.eq(&user.id))
            .order(chat_folders::created_at.asc())
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(crate::models::GqlFoldersList {
            folders: folders.into_iter().map(Into::into).collect(),
            error: None,
        })
    }

    /// Folder contents: subfolders + chats in the folder (paginated)
    async fn get_folder_contents(
        &self,
        ctx: &Context<'_>,
        input: crate::models::GetFolderContentsInput,
    ) -> Result<crate::models::GqlFolderContents> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get()?;

        let folder: crate::models::ChatFolder = chat_folders::table
            .filter(chat_folders::id.eq(&input.folder_id))
            .filter(chat_folders::user_id.eq(&user.id))
            .first(&mut conn)
            .map_err(|_| async_graphql::Error::new("Folder not found"))?;

        // Node parity: a top-level folder lists its whole subtree, a nested
        // folder lists immediate children only
        let subfolders: Vec<crate::models::ChatFolder> = if folder.top_parent_id.is_none() {
            chat_folders::table
                .filter(chat_folders::user_id.eq(&user.id))
                .filter(
                    chat_folders::top_parent_id
                        .eq(&input.folder_id)
                        .or(chat_folders::parent_id.eq(&input.folder_id)),
                )
                .order(chat_folders::created_at.asc())
                .load(&mut conn)
                .map_err(|e| AppError::Database(e.to_string()))?
        } else {
            chat_folders::table
                .filter(chat_folders::user_id.eq(&user.id))
                .filter(chat_folders::parent_id.eq(&input.folder_id))
                .order(chat_folders::created_at.asc())
                .load(&mut conn)
                .map_err(|e| AppError::Database(e.to_string()))?
        };
        drop(conn);

        let limit = input.limit.clamp(1, 100);
        let from = input.from.max(0);
        let chat_service = ChatService::new(&gql_ctx.db_pool);
        let GetChatStatsResult { chats, total } =
            chat_service.get_chats_with_stats(crate::services::chat::ChatsQuery {
                limit,
                offset: from,
                user_id: user.id.clone(),
                folder_id: Some(input.folder_id.clone()),
                ..Default::default()
            })?;

        let has_more = (from + limit) < total as i32;
        Ok(crate::models::GqlFolderContents {
            subfolders: subfolders.into_iter().map(Into::into).collect(),
            chats: chats.into_iter().map(GqlChat::from).collect(),
            next: has_more.then_some((from + limit) as f64),
            total: Some(total as i32),
        })
    }

    /// MCP servers configured for the current user (read-only; tool
    /// invocation is not ported yet).
    async fn mcp_servers(&self, ctx: &Context<'_>) -> Result<crate::models::GqlMcpServersList> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get()?;

        let servers: Vec<crate::models::McpServer> = crate::schema::mcp_servers::table
            .filter(
                crate::schema::mcp_servers::user_id
                    .eq(&user.id)
                    .or(crate::schema::mcp_servers::user_id.is_null()),
            )
            .order(crate::schema::mcp_servers::created_at.asc())
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let servers: Vec<crate::models::GqlMcpServer> =
            servers.into_iter().map(Into::into).collect();
        Ok(crate::models::GqlMcpServersList {
            total: Some(servers.len() as i32),
            servers,
            error: None,
        })
    }

    /// Live tools listing for an MCP server
    async fn get_mcp_server_tools(
        &self,
        ctx: &Context<'_>,
        server_id: String,
        auth_token: Option<String>,
    ) -> Result<crate::models::GqlMcpToolsListResponse> {
        use crate::schema::mcp_servers;
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get()?;

        let server: crate::models::McpServer = match mcp_servers::table
            .filter(mcp_servers::id.eq(&server_id))
            .filter(mcp_servers::user_id.eq(&user.id))
            .first(&mut conn)
        {
            Ok(server) => server,
            Err(_) => {
                return Ok(crate::models::GqlMcpToolsListResponse {
                    tools: None,
                    error: Some("MCP server not found".to_string()),
                })
            }
        };
        drop(conn);

        let mut client =
            crate::services::mcp::McpClient::for_server(&server, auth_token.as_deref());
        match client.list_tools().await {
            Ok(tools) => {
                let stored = crate::services::mcp::tools_to_stored_json(&tools);
                let parsed: Vec<crate::models::GqlMcpTool> =
                    serde_json::from_str(&stored).unwrap_or_default();
                Ok(crate::models::GqlMcpToolsListResponse {
                    tools: Some(parsed),
                    error: None,
                })
            }
            Err(e) => Ok(crate::models::GqlMcpToolsListResponse {
                tools: None,
                error: Some(e.to_string()),
            }),
        }
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
            from: None,
            search_term: None,
            pinned: None,
            folder_id: None,
        });

        let limit = input.limit.unwrap_or(20);
        let offset = input.from.or(input.offset).unwrap_or(0);
        let chat_service: ChatService = ChatService::new(&gql_ctx.db_pool);

        let GetChatStatsResult { chats, total } =
            chat_service.get_chats_with_stats(crate::services::chat::ChatsQuery {
                limit,
                offset,
                search_term: input.search_term.clone(),
                user_id: user.id.clone(),
                pinned: input.pinned,
                folder_id: input.folder_id.clone(),
                ..Default::default()
            })?;

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
    async fn get_chat_by_id(
        &self,
        ctx: &Context<'_>,
        id: async_graphql::ID,
    ) -> Result<Option<GqlChat>> {
        let id = id.to_string();
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
        let GetChatStatsResult { chats, total: _ } =
            chat_service.get_chats_with_stats(crate::services::chat::ChatsQuery {
                limit: 1,
                user_id: user.id.clone(),
                chat_id: Some(input.chat_id.clone()),
                ..Default::default()
            })?;

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
            error_status: None,
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
    async fn get_models(&self, ctx: &Context<'_>, reload: Option<bool>) -> Result<GqlModelsList> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;

        // reload: refresh the models list from the providers first
        if reload.unwrap_or(false) {
            let ai_service = crate::services::ai::AIService::new(
                gql_ctx.config.with_user_settings(user.settings.as_ref()),
            );
            let model_service =
                crate::services::model::ModelService::new(&gql_ctx.db_pool, &ai_service);
            model_service
                .refresh_models(user)
                .await
                .map_err(|e| AppError::Internal(format!("Failed to refresh models: {}", e)))?;
        }

        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let models_result: Vec<Model> = models::table
            .filter(models::user_id.eq(&user.id))
            .order(models::name.asc())
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Get provider information from AI service (user credentials over env)
        let ai_service = crate::services::ai::AIService::new(
            gql_ctx.config.with_user_settings(user.settings.as_ref()),
        );
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
        let user = gql_ctx.require_user()?;
        let ai_service = crate::services::ai::AIService::new(
            gql_ctx.config.with_user_settings(user.settings.as_ref()),
        );

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
                predominant_color: file.predominant_color,
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
