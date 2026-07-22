use async_graphql::{Context, Object, Result};
use chrono::Utc;
use diesel::prelude::*;
use std::sync::{Arc, Mutex};
use tracing::{error, info, instrument, warn};

use crate::graphql::GraphQLContext;
use crate::log_user_action;
use crate::models::{
    message, AuthProvider, AuthResponse, Chat, CreateChatInput, CreateCustomModelInput,
    CreateMessageInput, DeleteModelInput, EditMessageResponse, GqlChat, GqlMessage, GqlModel,
    GqlModelsList, GqlNewMessage, GqlProviderInfo, LoginInput, Message, MessageRole, Model,
    NewChat, NewUser, ProviderDetail, RegisterInput, TestCustomModelInput, TestModelInput,
    UpdateChatInput, UpdateCustomModelInput, UpdateModelStatusInput, UpdateUserInput, User,
    ROLE_ADMIN, ROLE_USER,
};
use crate::schema::{chat_files, chat_folders, chats, messages, models, users};
use crate::services::ai::{
    AIProviderService, AIProviderWrapper, AIService, GenerateImagesRequest, StreamCallbacks,
};
use crate::services::chat::{ChatService, GetChatStatsResult};
use crate::services::pubsub::get_global_pubsub;
use crate::services::s3::S3Service;
use crate::utils::errors::AppError;
use crate::utils::jwt;

#[derive(Default)]
pub struct Mutation;

#[Object]

impl Mutation {
    /// Register a new user
    #[instrument(skip(self, ctx, input), fields(email = %input.email))]
    async fn register(&self, ctx: &Context<'_>, input: RegisterInput) -> Result<AuthResponse> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        info!("User registration attempt for email: {}", input.email);

        // Check if user already exists
        let existing_user: Option<User> = users::table
            .filter(users::email.eq(&input.email))
            .first(&mut conn)
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;

        if existing_user.is_some() {
            warn!(
                "Registration failed: User already exists for email: {}",
                input.email
            );
            return Err(async_graphql::Error::new("User already exists"));
        }

        // Hash password
        let hashed_password =
            bcrypt::hash(&input.password, bcrypt::DEFAULT_COST).map_err(AppError::from)?;

        let user_role_str = if gql_ctx.config.default_admin_emails.contains(&input.email) {
            ROLE_ADMIN
        } else {
            ROLE_USER
        };

        let new_user = NewUser::new(
            input.email,
            Some(hashed_password),
            input.first_name,
            input.last_name,
            None,                                  // Google ID not provided
            None,                                  // GitHub ID not provided
            None,                                  // Microsoft ID not provided
            Some(AuthProvider::Local.to_string()), // Auth provider
            None,
            user_role_str.to_string(),
        );

        let user = diesel::insert_into(users::table)
            .values(&new_user)
            .get_result::<User>(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let token = jwt::create_token(&user.id, &gql_ctx.config.jwt_secret)?;

        info!(
            "User registration successful for email: {}, user_id: {}",
            new_user.email, user.id
        );
        log_user_action!(&user.id, "register", email = %new_user.email);

        Ok(AuthResponse { token, user })
    }

    /// Login user
    #[instrument(skip(self, ctx, input), fields(email = %input.email))]
    async fn login(&self, ctx: &Context<'_>, input: LoginInput) -> Result<AuthResponse> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        info!("User login attempt for email: {}", input.email);

        let user: User = users::table
            .filter(users::email.eq(&input.email))
            .first(&mut conn)
            .map_err(|_| {
                warn!("Login failed: User not found for email: {}", input.email);
                async_graphql::Error::new("Invalid credentials")
            })?;

        if let Some(password_hash) = &user.password {
            let valid = bcrypt::verify(&input.password, password_hash).map_err(AppError::from)?;

            if !valid {
                warn!("Login failed: Invalid password for email: {}", input.email);
                return Err(async_graphql::Error::new("Invalid credentials"));
            }
        } else {
            warn!("Login failed: No password hash for email: {}", input.email);
            return Err(async_graphql::Error::new("Invalid credentials"));
        }

        let token = jwt::create_token(&user.id, &gql_ctx.config.jwt_secret)?;

        info!(
            "User login successful for email: {}, user_id: {}",
            input.email, user.id
        );
        log_user_action!(&user.id, "login", email = %input.email);

        Ok(AuthResponse { token, user })
    }

    /// Update user information
    async fn update_user(&self, ctx: &Context<'_>, input: UpdateUserInput) -> Result<User> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        diesel::update(users::table.filter(users::id.eq(&user.id)))
            .set((
                input.email.map(|e| users::email.eq(e)),
                input.first_name.map(|f| users::first_name.eq(f)),
                input.last_name.map(|l| users::last_name.eq(l)),
                input
                    .default_model_id
                    .map(|m| users::default_model_id.eq(m)),
                input
                    .default_system_prompt
                    .map(|p| users::default_system_prompt.eq(p)),
                input.avatar_url.map(|a| users::avatar_url.eq(a)),
                input
                    .documents_embeddings_model_id
                    .map(|m| users::documents_embeddings_model_id.eq(m)),
                input
                    .document_summarization_model_id
                    .map(|m| users::document_summarization_model_id.eq(m)),
                input
                    .default_temperature
                    .map(|t| users::default_temperature.eq(t)),
                input
                    .default_max_tokens
                    .map(|t| users::default_max_tokens.eq(t)),
                input.default_top_p.map(|t| users::default_top_p.eq(t)),
                input
                    .default_images_count
                    .map(|c| users::default_images_count.eq(c)),
                input
                    .settings
                    .as_ref()
                    .map(|s| users::settings.eq(serde_json::to_string(s).unwrap_or_default())),
                users::updated_at.eq(Utc::now().naive_utc()),
            ))
            .execute(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let updated_user: User = users::table
            .filter(users::id.eq(&user.id))
            .first(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(updated_user)
    }

    /// Create a new chat
    async fn create_chat(&self, ctx: &Context<'_>, input: CreateChatInput) -> Result<GqlChat> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let new_chat = NewChat::new(
            input.title.unwrap_or_default(),
            input.description,
            Some(user.id.clone()),
            input.model_id,
            input.system_prompt,
        );

        let chat = diesel::insert_into(chats::table)
            .values(&new_chat)
            .get_result::<Chat>(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(GqlChat::from(chat))
    }

    /// Update chat
    async fn update_chat(
        &self,
        ctx: &Context<'_>,
        id: async_graphql::ID,
        input: UpdateChatInput,
    ) -> Result<GqlChat> {
        let id = id.to_string();
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        // The client sends generation settings as a nested object (Node API
        // shape); flat fields are kept for backwards compatibility. Settings
        // without a backing column (thinking, voice, …) are not persisted.
        let settings = input.settings.unwrap_or_default();
        let temperature = settings.temperature.or(input.temperature);
        let max_tokens = settings.max_tokens.or(input.max_tokens);
        let top_p = settings.top_p.or(input.top_p);

        // tools are stored as a JSON array in the chats.tools column
        let tools_json = match input.tools {
            Some(tools) => Some(
                serde_json::to_string(
                    &tools
                        .into_iter()
                        .map(crate::models::ChatTool::from)
                        .collect::<Vec<_>>(),
                )
                .map_err(|e| AppError::Internal(e.to_string()))?,
            ),
            None => None,
        };

        diesel::update(
            chats::table
                .filter(chats::id.eq(&id))
                .filter(chats::user_id.eq(&user.id)),
        )
        .set((
            input.title.map(|t| chats::title.eq(t)),
            input.description.map(|d| chats::description.eq(d)),
            input.model_id.map(|m| chats::model_id.eq(m)),
            temperature.map(|t| chats::temperature.eq(t)),
            max_tokens.map(|m| chats::max_tokens.eq(m)),
            top_p.map(|p| chats::top_p.eq(p)),
            settings.system_prompt.map(|s| chats::system_prompt.eq(s)),
            settings.images_count.map(|c| chats::images_count.eq(c)),
            input.is_pinned.map(|p| chats::is_pinned.eq(p)),
            tools_json.map(|t| chats::tools.eq(t)),
            match &input.folder_id {
                async_graphql::MaybeUndefined::Undefined => None,
                async_graphql::MaybeUndefined::Null => Some(chats::folder_id.eq(None::<String>)),
                async_graphql::MaybeUndefined::Value(id) => {
                    Some(chats::folder_id.eq(Some(id.clone())))
                }
            },
            chats::updated_at.eq(Utc::now().naive_utc()),
        ))
        .execute(&mut conn)
        .map_err(|e| AppError::Database(e.to_string()))?;

        let chat_service: ChatService = ChatService::new(&gql_ctx.db_pool);
        let GetChatStatsResult { chats, total: _ } =
            chat_service.get_chats_with_stats(crate::services::chat::ChatsQuery {
                limit: 1,
                user_id: user.id.clone(),
                chat_id: Some(id.clone()),
                ..Default::default()
            })?;

        if chats.is_empty() {
            return Err(AppError::NotFound("Chat not found".to_string()).into());
        }

        // First verify the chat belongs to the user
        let chat = chats.into_iter().next().unwrap();
        Ok(GqlChat::from(chat))
    }

    /// Delete chat
    async fn delete_chat(&self, ctx: &Context<'_>, id: async_graphql::ID) -> Result<bool> {
        let id = id.to_string();
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let deleted_count = diesel::delete(
            chats::table
                .filter(chats::id.eq(&id))
                .filter(chats::user_id.eq(&user.id)),
        )
        .execute(&mut conn)
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(deleted_count > 0)
    }

    /// Register an MCP server
    async fn create_mcp_server(
        &self,
        ctx: &Context<'_>,
        input: crate::models::CreateMcpServerInput,
    ) -> Result<crate::models::GqlMcpServerResponse> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get()?;

        let now = Utc::now().naive_utc();
        let server = crate::models::McpServer {
            id: uuid::Uuid::new_v4().to_string(),
            name: input.name,
            url: input.url,
            description: input.description,
            transport_type: input
                .transport_type
                .unwrap_or_else(|| "STREAMABLE_HTTP".to_string()),
            auth_type: input.auth_type.unwrap_or_else(|| "NONE".to_string()),
            auth_config: input
                .auth_config
                .as_ref()
                .map(|c| serde_json::to_string(c).unwrap_or_default()),
            tools: None,
            is_active: true,
            user_id: Some(user.id.clone()),
            created_at: now,
            updated_at: now,
        };

        let server: crate::models::McpServer =
            diesel::insert_into(crate::schema::mcp_servers::table)
                .values(&server)
                .get_result(&mut conn)
                .map_err(|e| AppError::Database(e.to_string()))?;

        log_user_action!(&user.id, "create_mcp_server", url = %server.url);
        Ok(crate::models::GqlMcpServerResponse {
            server: Some(server.into()),
            error: None,
        })
    }

    /// Update an MCP server
    async fn update_mcp_server(
        &self,
        ctx: &Context<'_>,
        input: crate::models::UpdateMcpServerInput,
    ) -> Result<crate::models::GqlMcpServerResponse> {
        use crate::schema::mcp_servers;
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get()?;

        let server: crate::models::McpServer = diesel::update(
            mcp_servers::table
                .filter(mcp_servers::id.eq(&input.id))
                .filter(mcp_servers::user_id.eq(&user.id)),
        )
        .set((
            input.name.map(|n| mcp_servers::name.eq(n)),
            input.url.map(|u| mcp_servers::url.eq(u)),
            input.description.map(|d| mcp_servers::description.eq(d)),
            input
                .transport_type
                .map(|t| mcp_servers::transport_type.eq(t)),
            input.auth_type.map(|t| mcp_servers::auth_type.eq(t)),
            input
                .auth_config
                .as_ref()
                .map(|c| mcp_servers::auth_config.eq(serde_json::to_string(c).unwrap_or_default())),
            mcp_servers::updated_at.eq(Utc::now().naive_utc()),
        ))
        .get_result(&mut conn)
        .map_err(|_| async_graphql::Error::new("MCP server not found"))?;

        Ok(crate::models::GqlMcpServerResponse {
            server: Some(server.into()),
            error: None,
        })
    }

    /// Delete an MCP server
    async fn delete_mcp_server(
        &self,
        ctx: &Context<'_>,
        input: crate::models::DeleteMcpServerInput,
    ) -> Result<bool> {
        use crate::schema::mcp_servers;
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get()?;

        let deleted = diesel::delete(
            mcp_servers::table
                .filter(mcp_servers::id.eq(&input.id))
                .filter(mcp_servers::user_id.eq(&user.id)),
        )
        .execute(&mut conn)
        .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(deleted > 0)
    }

    /// Connect to the MCP server, list its tools and store them
    async fn refetch_mcp_server_tools(
        &self,
        ctx: &Context<'_>,
        server_id: String,
        auth_token: Option<String>,
    ) -> Result<crate::models::GqlMcpServerResponse> {
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
                return Ok(crate::models::GqlMcpServerResponse {
                    server: None,
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
                let mut conn = gql_ctx.db_pool.get()?;
                let server: crate::models::McpServer =
                    diesel::update(mcp_servers::table.filter(mcp_servers::id.eq(&server_id)))
                        .set((
                            mcp_servers::tools.eq(stored),
                            mcp_servers::updated_at.eq(Utc::now().naive_utc()),
                        ))
                        .get_result(&mut conn)
                        .map_err(|e| AppError::Database(e.to_string()))?;
                Ok(crate::models::GqlMcpServerResponse {
                    server: Some(server.into()),
                    error: None,
                })
            }
            Err(e) => Ok(crate::models::GqlMcpServerResponse {
                server: None,
                error: Some(format!("Failed to refetch tools: {}", e)),
            }),
        }
    }

    /// Invoke a single MCP tool for testing
    async fn test_mcp_tool(
        &self,
        ctx: &Context<'_>,
        input: crate::models::TestMcpToolInput,
    ) -> Result<crate::models::GqlMcpToolTestResponse> {
        use crate::schema::mcp_servers;
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get()?;

        let server: crate::models::McpServer = match mcp_servers::table
            .filter(mcp_servers::id.eq(&input.server_id))
            .filter(mcp_servers::user_id.eq(&user.id))
            .first(&mut conn)
        {
            Ok(server) => server,
            Err(_) => {
                return Ok(crate::models::GqlMcpToolTestResponse {
                    result: None,
                    error: Some("MCP server not found".to_string()),
                })
            }
        };
        drop(conn);

        let args: serde_json::Value = match &input.args_json {
            Some(json) if !json.trim().is_empty() => match serde_json::from_str(json) {
                Ok(v) => v,
                Err(e) => {
                    return Ok(crate::models::GqlMcpToolTestResponse {
                        result: None,
                        error: Some(format!("Invalid argsJson: {}", e)),
                    })
                }
            },
            _ => serde_json::json!({}),
        };

        let mut client =
            crate::services::mcp::McpClient::for_server(&server, input.auth_token.as_deref());
        match client.call_tool(&input.tool_name, args).await {
            Ok(result) => Ok(crate::models::GqlMcpToolTestResponse {
                result: Some(result),
                error: None,
            }),
            Err(e) => Ok(crate::models::GqlMcpToolTestResponse {
                result: None,
                error: Some(e.to_string()),
            }),
        }
    }

    /// Create a chat folder
    async fn create_folder(
        &self,
        ctx: &Context<'_>,
        input: crate::models::CreateFolderInput,
    ) -> Result<crate::models::GqlFolder> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get()?;

        // topParentId is the root of the parent's tree (Node parity)
        let top_parent_id = match &input.parent_id {
            Some(parent_id) => {
                let parent: crate::models::ChatFolder = chat_folders::table
                    .filter(chat_folders::id.eq(parent_id))
                    .filter(chat_folders::user_id.eq(&user.id))
                    .first(&mut conn)
                    .map_err(|_| async_graphql::Error::new("Parent folder not found"))?;
                Some(parent.top_parent_id.unwrap_or(parent.id))
            }
            None => None,
        };

        let folder = crate::models::ChatFolder::new(
            input.name,
            input.color,
            user.id.clone(),
            input.parent_id,
            top_parent_id,
        );
        let folder: crate::models::ChatFolder = diesel::insert_into(chat_folders::table)
            .values(&folder)
            .get_result(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(folder.into())
    }

    /// Rename / recolor a folder
    async fn update_folder(
        &self,
        ctx: &Context<'_>,
        id: async_graphql::ID,
        input: crate::models::UpdateFolderInput,
    ) -> Result<crate::models::GqlFolder> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get()?;
        let id = id.to_string();

        let folder: crate::models::ChatFolder = diesel::update(
            chat_folders::table
                .filter(chat_folders::id.eq(&id))
                .filter(chat_folders::user_id.eq(&user.id)),
        )
        .set((
            input.name.map(|n| chat_folders::name.eq(n)),
            input.color.map(|c| chat_folders::color.eq(c)),
            chat_folders::updated_at.eq(Utc::now().naive_utc()),
        ))
        .get_result(&mut conn)
        .map_err(|_| async_graphql::Error::new("Folder not found"))?;

        Ok(folder.into())
    }

    /// Delete a folder with its subtree; contained chats are unfiled
    async fn delete_folder(&self, ctx: &Context<'_>, id: async_graphql::ID) -> Result<bool> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get()?;
        let id = id.to_string();

        // collect the subtree (folder itself + descendants via top_parent_id/parent_id)
        let subtree: Vec<String> = chat_folders::table
            .filter(chat_folders::user_id.eq(&user.id))
            .filter(
                chat_folders::id
                    .eq(&id)
                    .or(chat_folders::top_parent_id.eq(&id))
                    .or(chat_folders::parent_id.eq(&id)),
            )
            .select(chat_folders::id)
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        if subtree.is_empty() {
            return Ok(false);
        }

        diesel::update(chats::table.filter(chats::folder_id.eq_any(&subtree)))
            .set(chats::folder_id.eq(None::<String>))
            .execute(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let deleted = diesel::delete(chat_folders::table.filter(chat_folders::id.eq_any(&subtree)))
            .execute(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(deleted > 0)
    }

    /// Delete a RAG document (S3 objects by prefix + DB row; chunks and
    /// chat links cascade)
    async fn delete_document(&self, ctx: &Context<'_>, id: async_graphql::ID) -> Result<bool> {
        use crate::schema::{chat_documents, document_chunks, documents};
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get()?;
        let id = id.to_string();

        let document: crate::models::Document = documents::table
            .filter(documents::id.eq(&id))
            .filter(documents::owner_id.eq(&user.id))
            .first(&mut conn)
            .map_err(|_| async_graphql::Error::new("Document not found"))?;

        if let Some(s3key) = document.s3key.as_deref().filter(|k| !k.is_empty()) {
            let effective_config = gql_ctx.config.with_user_settings(user.settings.as_ref());
            let mut s3 = S3Service::new(effective_config);
            if let Err(e) = s3.delete_by_prefix(s3key).await {
                warn!("Failed to delete document S3 objects: {}", e);
            }
        }

        diesel::delete(document_chunks::table.filter(document_chunks::document_id.eq(&id)))
            .execute(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;
        diesel::delete(chat_documents::table.filter(chat_documents::document_id.eq(&id)))
            .execute(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;
        diesel::delete(documents::table.filter(documents::id.eq(&id)))
            .execute(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(true)
    }

    /// Re-run the indexing pipeline for a document
    async fn reindex_document(
        &self,
        ctx: &Context<'_>,
        id: async_graphql::ID,
    ) -> Result<crate::models::GqlDocument> {
        enqueue_document_command(ctx, id, true).await
    }

    /// Queue a document for parsing (used after upload retries)
    async fn process_document(
        &self,
        ctx: &Context<'_>,
        id: async_graphql::ID,
        #[graphql(name = "force")] _force: Option<bool>,
    ) -> Result<crate::models::GqlDocument> {
        enqueue_document_command(ctx, id, false).await
    }

    /// Link RAG documents to a chat
    async fn add_documents_to_chat(
        &self,
        ctx: &Context<'_>,
        #[graphql(name = "documentIds")] document_ids: Vec<async_graphql::ID>,
        #[graphql(name = "chatId")] chat_id: async_graphql::ID,
    ) -> Result<crate::models::GqlChatDocumentsResponse> {
        change_chat_documents(ctx, document_ids, chat_id, true).await
    }

    /// Unlink RAG documents from a chat
    async fn remove_documents_from_chat(
        &self,
        ctx: &Context<'_>,
        #[graphql(name = "documentIds")] document_ids: Vec<async_graphql::ID>,
        #[graphql(name = "chatId")] chat_id: async_graphql::ID,
    ) -> Result<crate::models::GqlChatDocumentsResponse> {
        change_chat_documents(ctx, document_ids, chat_id, false).await
    }

    /// Create a new message
    async fn create_message(
        &self,
        ctx: &Context<'_>,
        input: CreateMessageInput,
    ) -> Result<GqlMessage> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Verify chat belongs to user
        let chat: Chat = chats::table
            .filter(chats::id.eq(&input.chat_id))
            .filter(chats::user_id.eq(&user.id))
            .first(&mut conn)
            .map_err(|_| async_graphql::Error::new("Chat not found"))?;

        let model_id = input.model_id.clone().unwrap_or_else(|| {
            chat.model_id.clone().unwrap_or_else(|| {
                user.default_model_id
                    .clone()
                    .unwrap_or("default".to_string())
            })
        });

        if model_id.is_empty() {
            return Err(AppError::Validation("Model ID is required".to_string()).into());
        }

        // Find the model in the database
        let model: Model = models::table
            .filter(models::model_id.eq(&model_id))
            .filter(models::user_id.eq(&user.id))
            .first(&mut conn)
            .map_err(|_| async_graphql::Error::new("Model not found"))?;

        if !model.is_active {
            return Err(AppError::Validation("Model is not active".to_string()).into());
        }

        let new_message = Message::new(
            input.chat_id.clone(),
            Some(user.id.clone()),
            input.content.clone(),
            input.role.unwrap_or_else(|| "user".to_string()),
            model_id.clone(),
            Some(model.name.clone()),
        );

        let message = diesel::insert_into(messages::table)
            .values(&new_message)
            .get_result::<Message>(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        diesel::update(
            chats::table
                .filter(chats::id.eq(&input.chat_id))
                .filter(chats::is_pristine.eq(true)),
        )
        .set(chats::is_pristine.eq(false))
        .execute(&mut conn)
        .map_err(|e| AppError::Database(e.to_string()))?;

        let pubsub = get_global_pubsub();
        let gql_message = message::GqlNewMessage {
            r#type: String::from(message::MessageType::Message),
            error: None,
            message: Some(GqlMessage::from(message.clone())),
            streaming: Some(false),
            chat: None,
        };

        if let Err(e) = pubsub.publish_to_chat(&input.chat_id, gql_message).await {
            warn!("Failed to publish message to subscribers: {:?}", e);
        }

        // profile-settings credentials take precedence over env (Node parity)
        let effective_config = gql_ctx.config.with_user_settings(user.settings.as_ref());
        let ai_service = AIService::new(effective_config.clone());
        let provider = ai_service
            .get_provider_for_model(&model)
            .map_err(async_graphql::Error::from)?;

        // Images-generation models bypass the chat/streaming path entirely:
        // the user message is the prompt, the response is a set of images
        // stored to S3 and referenced from the assistant message (same flow
        // as the Node API's processModelResponse).
        // Only chat and images-generation models can serve a conversation
        if model.type_ != "chat" && model.type_ != "image_generation" {
            return Err(AppError::Validation(format!(
                "Model {} ({}) cannot be used for chat",
                model.name, model.type_
            ))
            .into());
        }

        if model.type_ == "image_generation" {
            let images_count = chat.images_count.unwrap_or(1).max(1);
            return generate_images_reply(
                gql_ctx,
                &effective_config,
                &provider,
                &chat,
                &message,
                &model,
                input.content.clone(),
                images_count,
            )
            .await;
        }

        // Load previous messages for context (up to 100 messages)
        const CONTEXT_MESSAGES_LIMIT: i64 = 100;

        let previous_messages: Vec<Message> = messages::table
            .filter(messages::chat_id.eq(&input.chat_id))
            .order(messages::created_at.desc())
            .limit(CONTEXT_MESSAGES_LIMIT)
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Reverse to chronological order and add current user message
        let mut input_messages = previous_messages;
        input_messages.reverse();
        input_messages.push(message.clone());

        // Convert database messages to AI service format and preprocess
        let model_messages = preprocess_messages(convert_messages_to_model_format(&input_messages));

        // Tools enabled on this chat (web search / MCP servers)
        let executable_tools = build_chat_tools(
            &mut conn,
            &effective_config,
            &user.id,
            chat.tools.as_deref(),
            input.mcp_tokens.as_deref(),
        )
        .await;

        // Create invoke request with preprocessed message context
        let invoke_request = crate::services::ai::InvokeModelRequest {
            model_id: model_id.clone(),
            messages: model_messages,
            temperature: input.temperature,
            max_tokens: input.max_tokens,
            top_p: input.top_p,
            system_prompt: user.default_system_prompt.clone(),
            tools: (!executable_tools.is_empty()).then_some(executable_tools),
        };

        let ai_msg_data = Message::new(
            input.chat_id.clone(),
            None,
            String::new(), // Placeholder for AI response
            String::from(MessageRole::Assistant),
            model_id.clone(),
            Some(model.name.clone()),
        );
        let ai_message = diesel::insert_into(messages::table)
            .values(&ai_msg_data)
            .get_result::<Message>(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Create a thread-safe accumulator for all tokens
        let accumulated_content = Arc::new(Mutex::new(String::new()));

        let callbacks = StreamCallbacks {
            on_token: |token: String| {
                let pubsub = pubsub.clone();
                let chat_id = input.chat_id.clone();
                let mut ai_message_pub = ai_message.clone();
                let accumulated_content = accumulated_content.clone();

                // Accumulate tokens in a thread-safe way
                if let Ok(mut content) = accumulated_content.lock() {
                    content.push_str(&token);
                    // Update the message with accumulated content
                    ai_message_pub.content = content.clone();
                }

                Box::pin(async move {
                    let pub_message = message::GqlNewMessage {
                        r#type: String::from(message::MessageType::Message),
                        error: None,
                        message: Some(GqlMessage::from(ai_message_pub)),
                        streaming: Some(true),
                        chat: None,
                    };

                    if let Err(e) = pubsub.publish_to_chat(&chat_id, pub_message).await {
                        warn!("Failed to publish message to subscribers: {:?}", e);
                    }
                })
            },
            on_error: |error: AppError| {
                let pubsub = pubsub.clone();
                let chat_id = input.chat_id.clone();
                let error_message = format!("Model inference error: {:?}", error);

                let mut conn_cb = match gql_ctx
                    .db_pool
                    .get()
                    .map_err(|e| AppError::Database(e.to_string()))
                {
                    Ok(conn) => conn,
                    Err(e) => {
                        error!(
                            "Failed to get database connection in error callback: {:?}",
                            e
                        );
                        return Box::pin(async move {
                            let pub_message = message::GqlNewMessage {
                                r#type: String::from(message::MessageType::Message),
                                error: Some(format!("Database connection error: {:?}", e)),
                                message: None,
                                streaming: Some(false),
                                chat: None,
                            };

                            if let Err(e) = pubsub.publish_to_chat(&chat_id, pub_message).await {
                                warn!("Failed to publish error to subscribers: {:?}", e);
                            }
                        });
                    }
                };

                // Update message in database with error
                let _ = diesel::update(messages::table.filter(messages::id.eq(&ai_message.id)))
                    .set((
                        messages::content.eq(error_message.clone()),
                        messages::role.eq(String::from(MessageRole::Error)),
                        messages::updated_at.eq(Utc::now().naive_utc()),
                    ))
                    .execute(&mut conn_cb)
                    .map_err(|e| {
                        error!("Failed to write error message: {:?}", e);
                    });

                let mut error_ai_message = ai_message.clone();
                error_ai_message.content = error_message;
                error_ai_message.role = String::from(MessageRole::Error);

                Box::pin(async move {
                    let pub_message: GqlNewMessage = message::GqlNewMessage {
                        r#type: String::from(message::MessageType::Message),
                        error: error_ai_message.content.clone().into(),
                        message: Some(GqlMessage::from(error_ai_message)),
                        streaming: Some(false),
                        chat: None,
                    };

                    if let Err(e) = pubsub.publish_to_chat(&chat_id, pub_message).await {
                        warn!("Failed to publish message to subscribers: {:?}", e);
                    }
                })
            },

            on_complete: |content: String| {
                let pubsub = pubsub.clone();
                let chat_id = input.chat_id.clone();

                let mut conn_cb = match gql_ctx
                    .db_pool
                    .get()
                    .map_err(|e| AppError::Database(e.to_string()))
                {
                    Ok(conn) => conn,
                    Err(e) => {
                        error!(
                            "Failed to get database connection in complete callback: {:?}",
                            e
                        );
                        return Box::pin(async move {
                            let pub_message = message::GqlNewMessage {
                                r#type: String::from(message::MessageType::Message),
                                error: Some(format!("Database connection error: {:?}", e)),
                                message: None,
                                streaming: Some(false),
                                chat: None,
                            };
                            if let Err(e) = pubsub.publish_to_chat(&chat_id, pub_message).await {
                                warn!("Failed to publish error to subscribers: {:?}", e);
                            }
                        });
                    }
                };

                // Update message in database
                let _ = diesel::update(messages::table.filter(messages::id.eq(&ai_message.id)))
                    .set((
                        messages::content.eq(content.clone()),
                        messages::updated_at.eq(Utc::now().naive_utc()),
                    ))
                    .execute(&mut conn_cb)
                    .map_err(|e| {
                        error!("Failed to write assistant message: {:?}", e);
                    });

                let mut res_ai_message = ai_message.clone();
                res_ai_message.content = content;

                Box::pin(async move {
                    let pub_message: GqlNewMessage = message::GqlNewMessage {
                        r#type: String::from(message::MessageType::Message),
                        error: None,
                        message: Some(GqlMessage::from(res_ai_message)),
                        streaming: Some(false),
                        chat: None,
                    };

                    if let Err(e) = pubsub.publish_to_chat(&chat_id, pub_message).await {
                        warn!("Failed to publish message to subscribers: {:?}", e);
                    }
                })
            },
        };

        let executed_tools = provider
            .invoke_model_stream(invoke_request, callbacks)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        // Record tool activity in the assistant message metadata (Node's
        // toolCalls/tools) and re-publish so the client shows tool badges.
        if !executed_tools.is_empty() {
            if let Err(e) =
                record_tool_metadata(gql_ctx, &input.chat_id, &ai_message.id, &executed_tools).await
            {
                warn!("Failed to record tool metadata: {:?}", e);
            }
        }

        Ok(GqlMessage::from(message))
    }

    /// Delete message and optionally following messages
    async fn delete_message(
        &self,
        ctx: &Context<'_>,
        id: async_graphql::ID,
        delete_following: Option<bool>,
    ) -> Result<crate::models::GqlDeleteMessageResponse> {
        let id = id.to_string();
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Get the message to delete
        let message: Message = messages::table
            .filter(messages::id.eq(&id))
            .filter(
                messages::user_id
                    .eq(&user.id)
                    .or(messages::user_id.is_null()),
            )
            .first(&mut conn)
            .map_err(|_| async_graphql::Error::new("Message not found"))?;

        let mut deleted = vec![message.clone()];

        if delete_following.unwrap_or(false) {
            let filter = messages::table
                .filter(messages::chat_id.eq(&message.chat_id))
                .filter(messages::created_at.ge(&message.created_at));

            // Delete all messages after this one in the same chat
            let following_messages: Vec<Message> = filter
                .order(messages::created_at.asc())
                .load(&mut conn)
                .map_err(|e| AppError::Database(e.to_string()))?;

            for msg in following_messages {
                if msg.id != message.id {
                    deleted.push(msg);
                }
            }

            diesel::delete(filter)
                .execute(&mut conn)
                .map_err(|e| AppError::Database(e.to_string()))?;
        } else {
            diesel::delete(messages::table.filter(messages::id.eq(&id)))
                .execute(&mut conn)
                .map_err(|e| AppError::Database(e.to_string()))?;
        }

        Ok(crate::models::GqlDeleteMessageResponse {
            messages: deleted.into_iter().map(GqlMessage::from).collect(),
        })
    }

    /// Edit a message and regenerate following messages
    #[instrument(skip(self, ctx, message_id), fields(user_id = tracing::field::Empty))]
    async fn edit_message(
        &self,
        ctx: &Context<'_>,
        message_id: async_graphql::ID,
        content: String,
        // accepted for schema compatibility; MCP tokens are unused until MCP is ported
        #[graphql(name = "messageContext")] _message_context: Option<
            crate::models::MessageContextInput,
        >,
    ) -> Result<EditMessageResponse> {
        let message_id = message_id.to_string();
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        tracing::Span::current().record("user_id", &user.id);
        info!("Editing message {} for user {}", message_id, user.id);

        // Get the message to edit
        let message: Message = messages::table
            .filter(messages::id.eq(&message_id))
            .filter(
                messages::user_id
                    .eq(&user.id)
                    .or(messages::user_id.is_null()),
            )
            .first(&mut conn)
            .map_err(|_| async_graphql::Error::new("Message not found"))?;

        // Only user messages can be edited
        if message.role != String::from(MessageRole::User) {
            return Ok(EditMessageResponse {
                message: None,
                error: Some("Only user messages can be edited".to_string()),
            });
        }

        // Delete all messages after this one in the same chat
        let deleted_count = diesel::delete(
            messages::table
                .filter(messages::chat_id.eq(&message.chat_id))
                .filter(messages::created_at.gt(&message.created_at)),
        )
        .execute(&mut conn)
        .map_err(|e| AppError::Database(e.to_string()))?;

        info!("Deleted {} following messages", deleted_count);

        // Update the message content
        let updated_message = diesel::update(messages::table.filter(messages::id.eq(&message_id)))
            .set((
                messages::content.eq(content.trim()),
                messages::updated_at.eq(Utc::now().naive_utc()),
            ))
            .get_result::<Message>(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        // TODO: Generate new assistant response here
        // For now, we'll just return the updated message
        // In a full implementation, you'd want to:
        // 1. Get the chat and user's default model
        // 2. Create a new assistant message
        // 3. Generate the AI response

        let gql_message = GqlMessage::from(updated_message);

        Ok(EditMessageResponse {
            message: Some(gql_message),
            error: None,
        })
    }

    /// Reload stored metadata for a chat file (Library). Image-feature
    /// extraction (predominant color, EXIF) is not ported yet, so this
    /// currently returns the stored row as-is.
    async fn reload_chat_file_metadata(
        &self,
        ctx: &Context<'_>,
        id: String,
    ) -> Result<crate::models::GqlChatFile> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let (file, _chat): (crate::models::ChatFile, Chat) = chat_files::table
            .inner_join(chats::table)
            .filter(chat_files::id.eq(&id))
            .filter(chats::user_id.eq(&user.id))
            .first(&mut conn)
            .map_err(|_| async_graphql::Error::new("Chat file not found"))?;

        Ok(crate::models::GqlChatFile {
            id: file.id,
            file_url: file
                .file_name
                .as_deref()
                .map(crate::models::chat_file::file_url),
            file_name: file.file_name,
            type_: file.type_,
            mime: file.mime,
            upload_file: file.upload_file,
            predominant_color: file.predominant_color,
            role: None,
            created_at: file.created_at,
            message: None,
            chat: None,
        })
    }

    /// Test a model
    #[instrument(skip(self, ctx), fields(id = %input.id, user_id = tracing::field::Empty))]
    async fn test_model(&self, ctx: &Context<'_>, input: TestModelInput) -> Result<GqlMessage> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        tracing::Span::current().record("user_id", &user.id);
        info!("Testing model {} for user {}", input.id, user.id);

        // Find the model in the database
        let model: Model = models::table
            .filter(models::id.eq(&input.id))
            .filter(models::user_id.eq(&user.id))
            .first(&mut conn)
            .map_err(|_| async_graphql::Error::new("Model not found"))?;

        if !model.is_active {
            return Err(async_graphql::Error::new("Model is not active"));
        }

        if model.type_ == "image_generation" {
            return Err(async_graphql::Error::new(
                "Image output is not supported for test model",
            ));
        }

        let ai_service = AIService::new(gql_ctx.config.with_user_settings(user.settings.as_ref()));
        let provider = ai_service
            .get_provider_for_model(&model)
            .map_err(async_graphql::Error::from)?;

        // Embedding models have no chat endpoint — test with an embeddings request
        if model.type_ == "embedding" {
            let embedding = provider
                .get_embeddings(&model.model_id, &input.text)
                .await
                .map_err(async_graphql::Error::from)?;
            let timestamp = Utc::now().naive_utc();
            log_user_action!(&user.id, "test_model", model_id = %model.model_id, provider = %model.api_provider);
            return Ok(GqlMessage {
                id: uuid::Uuid::new_v4().to_string(),
                chat_id: "test".to_string(),
                user_id: Some(user.id.clone()),
                user: Some(user.clone()),
                content: format!("Embedding [{}]", embedding.len()),
                role: "assistant".to_string(),
                model_id: Some(model.model_id.clone()),
                model_name: Some(model.name.clone()),
                json_content: None,
                metadata: None,
                linked_to_message_id: None,
                linked_messages: None,
                status: None,
                status_info: None,
                created_at: timestamp,
                updated_at: timestamp,
            });
        }

        // Create test message
        let test_message = crate::services::ai::ModelMessage::text(
            crate::services::ai::MessageRole::User,
            input.text,
        );

        // Create invoke request (same sampling as the Node API's testModel:
        // temperature only — sending top_p as well trips models that accept
        // just one of the two, e.g. Claude Haiku 4.5)
        let invoke_request = crate::services::ai::InvokeModelRequest {
            model_id: model.model_id.clone(),
            messages: vec![test_message],
            temperature: Some(0.5),
            max_tokens: Some(256),
            top_p: None,
            system_prompt: None,
            tools: None,
        };

        // Test the model
        match provider.invoke_model(invoke_request).await {
            Ok(response) => {
                let timestamp = Utc::now().naive_utc();
                info!(
                    "Model test successful for model: {}, response length: {}",
                    model.model_id,
                    response.content.len()
                );
                log_user_action!(&user.id, "test_model", model_id = %model.model_id, provider = %model.api_provider);

                Ok(GqlMessage {
                    id: uuid::Uuid::new_v4().to_string(),
                    chat_id: "test".to_string(),
                    user_id: Some(user.id.clone()),
                    user: Some(user.clone()),
                    content: response.content,
                    role: "assistant".to_string(),
                    model_id: Some(model.model_id.clone()),
                    model_name: Some(model.name.clone()),
                    created_at: timestamp,
                    updated_at: timestamp,
                    json_content: None,
                    metadata: None,
                    linked_to_message_id: None,
                    linked_messages: None,
                    status: None,
                    status_info: None,
                })
            }
            Err(e) => {
                error!(
                    "Model test failed for model: {}, error: {}",
                    model.model_id, e
                );
                log_user_action!(&user.id, "test_model_failed", model_id = %model.model_id, error = %e);
                Err(AppError::Internal(format!("Model test failed: {}", e)).into())
            }
        }
    }

    /// Create a user-defined custom model (OpenAI-compatible REST endpoint)
    async fn create_custom_model(
        &self,
        ctx: &Context<'_>,
        input: CreateCustomModelInput,
    ) -> Result<GqlModel> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let existing: Option<Model> = models::table
            .filter(models::model_id.eq(&input.model_id))
            .filter(models::user_id.eq(&user.id))
            .first(&mut conn)
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;
        if existing.is_some() {
            return Err(async_graphql::Error::new(format!(
                "Model with ID '{}' already exists",
                input.model_id
            )));
        }

        let settings = crate::models::model::CustomModelSettings {
            endpoint: Some(input.endpoint),
            api_key: input.api_key,
            model_name: Some(input.model_name),
            protocol: Some(input.protocol),
        };

        let now = Utc::now().naive_utc();
        let model = Model {
            id: uuid::Uuid::new_v4().to_string(),
            name: input.name,
            model_id: input.model_id,
            description: input.description,
            user_id: Some(user.id.clone()),
            provider: Some("Custom".to_string()),
            api_provider: "CUSTOM_REST_API".to_string(),
            type_: input.type_.as_db_str().to_string(),
            streaming: input.streaming.unwrap_or(true),
            image_input: input.image_input.unwrap_or(false),
            max_input_tokens: input.max_input_tokens,
            tools: None,
            features: None,
            custom_settings: Some(
                serde_json::to_string(&settings).map_err(|e| AppError::Internal(e.to_string()))?,
            ),
            is_active: true,
            is_custom: true,
            created_at: now,
            updated_at: now,
        };

        let model: Model = diesel::insert_into(models::table)
            .values(&model)
            .get_result(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        log_user_action!(&user.id, "create_custom_model", model_id = %model.model_id);
        Ok(GqlModel::from_model(&model, user.clone()))
    }

    /// Update a custom model
    async fn update_custom_model(
        &self,
        ctx: &Context<'_>,
        input: UpdateCustomModelInput,
    ) -> Result<GqlModel> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let model: Model = models::table
            .filter(models::id.eq(&input.id))
            .filter(models::user_id.eq(&user.id))
            .filter(models::is_custom.eq(true))
            .first(&mut conn)
            .map_err(|_| async_graphql::Error::new("Custom model not found"))?;

        let mut settings: crate::models::model::CustomModelSettings = model
            .custom_settings
            .as_ref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(crate::models::model::CustomModelSettings {
                endpoint: None,
                api_key: None,
                model_name: None,
                protocol: None,
            });

        settings.endpoint = Some(input.endpoint);
        settings.model_name = Some(input.model_name);
        settings.protocol = Some(input.protocol);
        // API key changes only when explicitly provided (empty string clears)
        if let Some(api_key) = input.api_key {
            settings.api_key = if api_key.is_empty() {
                None
            } else {
                Some(api_key)
            };
        }

        let updated: Model = diesel::update(models::table.filter(models::id.eq(&model.id)))
            .set((
                models::name.eq(&input.name),
                models::description.eq(&input.description),
                models::type_.eq(input.type_.as_db_str()),
                models::streaming.eq(input.streaming.unwrap_or(model.streaming)),
                models::image_input.eq(input.image_input.unwrap_or(model.image_input)),
                models::max_input_tokens.eq(input.max_input_tokens.or(model.max_input_tokens)),
                models::custom_settings.eq(serde_json::to_string(&settings)
                    .map_err(|e| AppError::Internal(e.to_string()))?),
                models::updated_at.eq(Utc::now().naive_utc()),
            ))
            .get_result(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        log_user_action!(&user.id, "update_custom_model", model_id = %updated.model_id);
        Ok(GqlModel::from_model(&updated, user.clone()))
    }

    /// Delete a custom model
    async fn delete_model(&self, ctx: &Context<'_>, input: DeleteModelInput) -> Result<bool> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let deleted = diesel::delete(
            models::table
                .filter(models::id.eq(&input.id))
                .filter(models::user_id.eq(&user.id))
                .filter(models::is_custom.eq(true)),
        )
        .execute(&mut conn)
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(deleted > 0)
    }

    /// Test a custom model configuration before saving it. Embedding-type
    /// models are tested with an embeddings request (they have no chat
    /// endpoint); everything else runs a small chat completion.
    async fn test_custom_model(
        &self,
        ctx: &Context<'_>,
        input: TestCustomModelInput,
    ) -> Result<GqlMessage> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;

        let mut api_key = input.api_key.clone();
        // saved-model test: fall back to the stored key when none provided
        if api_key.as_deref().unwrap_or("").is_empty() {
            if let Some(model_id) = &input.model_id {
                let mut conn = gql_ctx
                    .db_pool
                    .get()
                    .map_err(|e| AppError::Database(e.to_string()))?;
                let existing: Option<Model> = models::table
                    .filter(models::model_id.eq(model_id))
                    .filter(models::user_id.eq(&user.id))
                    .first(&mut conn)
                    .optional()
                    .map_err(|e| AppError::Database(e.to_string()))?;
                api_key = existing
                    .and_then(|m| m.custom_settings)
                    .and_then(|s| {
                        serde_json::from_str::<crate::models::model::CustomModelSettings>(&s).ok()
                    })
                    .and_then(|s| s.api_key);
            }
        }

        let settings = crate::models::model::CustomModelSettings {
            endpoint: Some(input.endpoint.clone()),
            api_key,
            model_name: Some(input.model_name.clone()),
            protocol: Some(input.protocol.clone()),
        };
        let service = crate::services::custom::CustomService::from_settings(&settings)
            .map_err(async_graphql::Error::from)?;

        let timestamp = Utc::now().naive_utc();

        let content = if input.type_ == crate::models::model::ModelType::Embedding {
            let embedding = service
                .get_embeddings(&input.model_name, &input.text)
                .await
                .map_err(async_graphql::Error::from)?;
            let preview_len = 10.min(embedding.len());
            let preview = embedding[..preview_len]
                .iter()
                .map(|v| v.to_string())
                .collect::<Vec<_>>()
                .join(", ");
            format!(
                "Embedding [{}]: [{}{}]",
                embedding.len(),
                preview,
                if embedding.len() > preview_len {
                    ", ..."
                } else {
                    ""
                }
            )
        } else {
            let invoke_request = crate::services::ai::InvokeModelRequest {
                model_id: input.model_name.clone(),
                messages: vec![crate::services::ai::ModelMessage::text(
                    crate::services::ai::MessageRole::User,
                    input.text.clone(),
                )],
                temperature: Some(0.7),
                max_tokens: Some(100),
                top_p: None,
                system_prompt: Some("You are a helpful assistant.".to_string()),
                tools: None,
            };
            service
                .invoke_model(invoke_request)
                .await
                .map_err(async_graphql::Error::from)?
                .content
        };

        log_user_action!(&user.id, "test_custom_model", endpoint = %input.endpoint);

        Ok(GqlMessage {
            id: "test-result".to_string(),
            chat_id: "test".to_string(),
            user_id: Some(user.id.clone()),
            user: Some(user.clone()),
            content,
            role: "assistant".to_string(),
            model_id: Some(input.model_name.clone()),
            model_name: Some(input.model_name.clone()),
            json_content: None,
            metadata: None,
            linked_to_message_id: None,
            linked_messages: None,
            status: None,
            status_info: None,
            created_at: timestamp,
            updated_at: timestamp,
        })
    }

    /// Update model status (active/inactive)
    async fn update_model_status(
        &self,
        ctx: &Context<'_>,
        input: UpdateModelStatusInput,
    ) -> Result<GqlModel> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        diesel::update(
            models::table
                .filter(models::model_id.eq(&input.model_id))
                .filter(models::user_id.eq(&user.id)),
        )
        .set((
            models::is_active.eq(input.is_active),
            models::updated_at.eq(Utc::now().naive_utc()),
        ))
        .execute(&mut conn)
        .map_err(|e| AppError::Database(e.to_string()))?;

        let updated_model: Model = models::table
            .filter(models::model_id.eq(&input.model_id))
            .filter(models::user_id.eq(&user.id))
            .first(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(GqlModel::from_model(&updated_model, user.clone()))
    }

    /// Reload models from providers  
    #[instrument(skip(self, ctx))]
    async fn reload_models(&self, ctx: &Context<'_>) -> Result<GqlModelsList> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        info!("Reloading models from providers for user: {}", user.id);

        // Create AI service (profile-settings credentials over env)
        let ai_service = AIService::new(gql_ctx.config.with_user_settings(user.settings.as_ref()));

        let providers = ai_service
            .get_provider_info(true)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to get provider info: {}", e)))?;

        // Get provider information
        let gql_providers: Vec<GqlProviderInfo> = providers
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

        let models_service =
            crate::services::model::ModelService::new(&gql_ctx.db_pool, &ai_service);
        let gql_models = models_service.refresh_models(user).await?;

        let total_count = gql_models.len().min(i32::MAX as usize) as i32;
        info!(
            "Successfully reloaded {} models for user: {}",
            total_count, user.id
        );
        log_user_action!(
            &user.id,
            "reload_models",
            models_count = total_count,
            providers_count = gql_providers.len()
        );

        Ok(GqlModelsList {
            models: gql_models,
            providers: gql_providers,
            total: Some(total_count),
            error: None,
        })
    }
}

/// Generate images for an images-generation model and post them as the
/// assistant reply: upload to S3 under `{chatId}/{messageId}/{uuid}.{ext}`,
/// record a `chat_files` row per image (Library), embed markdown `/files/…`
/// links + jsonContent blocks in the message — the Node API's
/// processModelResponse flow.
#[allow(clippy::too_many_arguments)]
async fn generate_images_reply(
    gql_ctx: &GraphQLContext,
    effective_config: &crate::config::AppConfig,
    provider: &AIProviderWrapper,
    chat: &Chat,
    user_message: &Message,
    model: &Model,
    prompt: String,
    images_count: i32,
) -> Result<GqlMessage> {
    let pubsub = get_global_pubsub();

    let publish = |msg: Option<GqlMessage>, error: Option<String>| {
        let chat_id = chat.id.clone();
        async move {
            let pub_message = message::GqlNewMessage {
                r#type: String::from(message::MessageType::Message),
                error,
                message: msg,
                streaming: Some(false),
                chat: None,
            };
            if let Err(e) = pubsub.publish_to_chat(&chat_id, pub_message).await {
                warn!("Failed to publish message to subscribers: {:?}", e);
            }
        }
    };

    if prompt.trim().is_empty() {
        return Err(AppError::Validation("Image prompt is required".to_string()).into());
    }

    let request = GenerateImagesRequest {
        model_id: model.model_id.clone(),
        prompt,
        count: images_count,
    };

    let images = match provider.generate_images(request).await {
        Ok(images) => images,
        Err(e) => {
            let mut error_message = Message::new(
                chat.id.clone(),
                None,
                format!("Image generation error: {}", e),
                String::from(MessageRole::Error),
                model.model_id.clone(),
                Some(model.name.clone()),
            );
            error_message.linked_to_message_id = Some(user_message.id.clone());
            if let Ok(mut conn) = gql_ctx.db_pool.get() {
                let _ = diesel::insert_into(messages::table)
                    .values(&error_message)
                    .execute(&mut conn);
            }
            publish(Some(GqlMessage::from(error_message)), Some(e.to_string())).await;
            return Err(async_graphql::Error::from(e));
        }
    };

    let mut ai_message = Message::new(
        chat.id.clone(),
        None,
        String::new(),
        String::from(MessageRole::Assistant),
        model.model_id.clone(),
        Some(model.name.clone()),
    );

    let mut s3_service = S3Service::new(effective_config.clone());
    let mut json_blocks: Vec<serde_json::Value> = Vec::new();
    let mut markdown_links: Vec<String> = Vec::new();
    let mut conn = gql_ctx
        .db_pool
        .get()
        .map_err(|e| AppError::Database(e.to_string()))?;

    for image in &images {
        let extension = image.mime.strip_prefix("image/").unwrap_or("png");
        let file_name = format!(
            "{}/{}/{}.{}",
            chat.id,
            ai_message.id,
            uuid::Uuid::new_v4(),
            extension
        );

        s3_service
            .upload_file(&file_name, image.bytes.clone(), &image.mime)
            .await?;

        let chat_file = crate::models::ChatFile::new_image(
            chat.id.clone(),
            Some(ai_message.id.clone()),
            file_name.clone(),
            image.mime.clone(),
        );
        diesel::insert_into(chat_files::table)
            .values(&chat_file)
            .execute(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        json_blocks.push(serde_json::json!({
            "contentType": "image",
            "fileName": file_name,
            "mimeType": image.mime,
        }));
        markdown_links.push(format!(
            "![Generated Image]({})",
            crate::models::chat_file::file_url(&file_name)
        ));
    }

    ai_message.content = markdown_links.join("   ");
    ai_message.json_content = Some(
        serde_json::to_string(&json_blocks)
            .map_err(|e| AppError::Internal(format!("Failed to serialize content: {}", e)))?,
    );

    let ai_message: Message = diesel::insert_into(messages::table)
        .values(&ai_message)
        .get_result(&mut conn)
        .map_err(|e| AppError::Database(e.to_string()))?;

    // Track generated-images count on the chat (used by demo limits).
    let _ = diesel::update(chats::table.filter(chats::id.eq(&chat.id)))
        .set(chats::images_count.eq(chat.images_count.unwrap_or(0) + images.len() as i32))
        .execute(&mut conn);

    info!(
        "Generated {} image(s) for chat {} with {}",
        images.len(),
        chat.id,
        model.model_id
    );

    publish(Some(GqlMessage::from(ai_message)), None).await;

    Ok(GqlMessage::from(user_message.clone()))
}

/// Re-queue a document for parsing (`processDocument`) or reset it into
/// the indexing flow (`reindexDocument`).
async fn enqueue_document_command(
    ctx: &Context<'_>,
    id: async_graphql::ID,
    reindex: bool,
) -> Result<crate::models::GqlDocument> {
    use crate::schema::documents;
    let gql_ctx = ctx.data::<GraphQLContext>()?;
    let user = gql_ctx.require_user()?;
    let mut conn = gql_ctx.db_pool.get()?;
    let id = id.to_string();

    let mut document: crate::models::Document = documents::table
        .filter(documents::id.eq(&id))
        .filter(documents::owner_id.eq(&user.id))
        .first(&mut conn)
        .map_err(|_| async_graphql::Error::new("Document not found"))?;

    let s3key = document
        .s3key
        .clone()
        .filter(|k| !k.is_empty())
        .ok_or_else(|| async_graphql::Error::new("Document was not uploaded yet"))?;

    if reindex {
        document.status = crate::models::document::DOCUMENT_STATUS_CHUNKING.to_string();
        document.status_progress = 1.0;
        document.updated_at = Utc::now().naive_utc();
        diesel::update(documents::table.filter(documents::id.eq(&id)))
            .set((
                documents::status.eq(&document.status),
                documents::status_progress.eq(document.status_progress),
                documents::updated_at.eq(document.updated_at),
            ))
            .execute(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    let effective_config = gql_ctx.config.with_user_settings(user.settings.as_ref());
    let sqs = crate::services::sqs::SqsService::new(&effective_config)
        .await
        .map_err(async_graphql::Error::from)?;
    if reindex {
        // reindex jumps straight to indexing (chunked JSON already in S3)
        let queue = effective_config
            .sqs_documents_queue
            .as_deref()
            .ok_or_else(|| async_graphql::Error::new("SQS_DOCUMENTS_QUEUE not configured"))?;
        sqs.send_json_message(
            queue,
            &serde_json::json!({
                "command": "index_document",
                "documentId": document.id,
                "s3key": s3key,
                "mime": document.mime,
            }),
        )
        .await
        .map_err(async_graphql::Error::from)?;
    } else {
        sqs.send_parse_document(
            &effective_config,
            &document.id,
            &s3key,
            document.mime.as_deref(),
        )
        .await
        .map_err(async_graphql::Error::from)?;
    }

    Ok(document.into())
}

/// Link/unlink documents to/from a chat and return the updated chat with
/// its documents.
async fn change_chat_documents(
    ctx: &Context<'_>,
    document_ids: Vec<async_graphql::ID>,
    chat_id: async_graphql::ID,
    add: bool,
) -> Result<crate::models::GqlChatDocumentsResponse> {
    use crate::schema::chat_documents;
    let gql_ctx = ctx.data::<GraphQLContext>()?;
    let user = gql_ctx.require_user()?;
    let mut conn = gql_ctx.db_pool.get()?;
    let chat_id = chat_id.to_string();
    let document_ids: Vec<String> = document_ids.into_iter().map(|id| id.to_string()).collect();

    let chat: Chat = chats::table
        .filter(chats::id.eq(&chat_id))
        .filter(chats::user_id.eq(&user.id))
        .first(&mut conn)
        .map_err(|_| async_graphql::Error::new("Chat not found"))?;

    if add {
        for document_id in &document_ids {
            let exists: i64 = chat_documents::table
                .filter(chat_documents::chat_id.eq(&chat_id))
                .filter(chat_documents::document_id.eq(document_id))
                .count()
                .get_result(&mut conn)
                .map_err(|e| AppError::Database(e.to_string()))?;
            if exists == 0 {
                diesel::insert_into(chat_documents::table)
                    .values(crate::models::document::ChatDocument {
                        id: uuid::Uuid::new_v4().to_string(),
                        chat_id: chat_id.clone(),
                        document_id: document_id.clone(),
                    })
                    .execute(&mut conn)
                    .map_err(|e| AppError::Database(e.to_string()))?;
            }
        }
    } else {
        diesel::delete(
            chat_documents::table
                .filter(chat_documents::chat_id.eq(&chat_id))
                .filter(chat_documents::document_id.eq_any(&document_ids)),
        )
        .execute(&mut conn)
        .map_err(|e| AppError::Database(e.to_string()))?;
    }

    let mut gql_chat = GqlChat::from(chat);
    gql_chat.chat_documents = Some(crate::graphql::query::load_chat_documents(
        &mut conn, &chat_id,
    ));
    Ok(crate::models::GqlChatDocumentsResponse {
        chat: Some(gql_chat),
        error: None,
    })
}

/// Build the executable tools for a chat from its stored tools config:
/// the web search tool (when Yandex Search credentials are configured) and
/// the tools of each referenced active MCP server. Servers whose tool list
/// was never fetched are refreshed and stored on the way (Node's
/// fetchAndStoreTools). Failures only shrink the tool list.
async fn build_chat_tools(
    conn: &mut crate::database::DbConnection,
    config: &crate::config::AppConfig,
    user_id: &str,
    tools_json: Option<&str>,
    mcp_tokens: Option<&[crate::models::McpAuthTokenInput]>,
) -> Vec<crate::services::ai::ExecutableTool> {
    use crate::schema::mcp_servers;
    use crate::services::ai::{ExecutableTool, ToolBackend, ToolSpec};

    let chat_tools: Vec<crate::models::ChatTool> = tools_json
        .and_then(|json| serde_json::from_str(json).ok())
        .unwrap_or_default();
    if chat_tools.is_empty() {
        return Vec::new();
    }

    let mut result = Vec::new();

    if chat_tools.iter().any(|t| t.r#type == "web_search") {
        match crate::services::web_search::web_search_tool(config) {
            Some(tool) => result.push(tool),
            None => warn!("Web search tool requested but Yandex Search is not configured"),
        }
    }

    for chat_tool in chat_tools.iter().filter(|t| t.r#type == "mcp") {
        let Some(server_id) = chat_tool.id.as_deref() else {
            continue;
        };
        let server: Option<crate::models::McpServer> = mcp_servers::table
            .filter(mcp_servers::id.eq(server_id))
            .filter(
                mcp_servers::user_id
                    .eq(user_id)
                    .or(mcp_servers::user_id.is_null()),
            )
            .filter(mcp_servers::is_active.eq(true))
            .first(conn)
            .optional()
            .ok()
            .flatten();
        let Some(mut server) = server else {
            warn!("MCP server {} not found for chat tools", server_id);
            continue;
        };

        let auth_token = mcp_tokens
            .and_then(|tokens| tokens.iter().find(|t| t.server_id == server_id))
            .map(|t| t.access_token.clone());

        // Fetch and store the tool list if the server has none yet
        let has_tools = server
            .tools
            .as_deref()
            .and_then(|s| serde_json::from_str::<Vec<serde_json::Value>>(s).ok())
            .map(|tools| !tools.is_empty())
            .unwrap_or(false);
        if !has_tools {
            let mut client =
                crate::services::mcp::McpClient::for_server(&server, auth_token.as_deref());
            match client.list_tools().await {
                Ok(listed) => {
                    let stored = crate::services::mcp::tools_to_stored_json(&listed);
                    let _ =
                        diesel::update(mcp_servers::table.filter(mcp_servers::id.eq(&server.id)))
                            .set((
                                mcp_servers::tools.eq(stored.clone()),
                                mcp_servers::updated_at.eq(Utc::now().naive_utc()),
                            ))
                            .execute(conn);
                    server.tools = Some(stored);
                }
                Err(e) => {
                    warn!(
                        "Failed to fetch tools from MCP server {}: {}",
                        server.name, e
                    );
                    continue;
                }
            }
        }

        let stored_tools: Vec<serde_json::Value> = server
            .tools
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default();

        for (ndx, mcp_tool) in stored_tools.iter().enumerate() {
            let Some(tool_name) = mcp_tool.get("name").and_then(|n| n.as_str()) else {
                continue;
            };
            let input_schema = mcp_tool
                .get("inputSchema")
                .and_then(|s| s.as_str())
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_else(|| serde_json::json!({ "type": "object", "properties": {} }));
            let description = mcp_tool
                .get("description")
                .and_then(|d| d.as_str())
                .map(|d| d.to_string())
                .unwrap_or_else(|| format!("tool from {}", server.name));

            // Provider-facing name mirrors Node: M_<serverId, no dashes>_<index>
            result.push(ExecutableTool {
                spec: ToolSpec {
                    name: format!("M_{}_{}", server_id.replace('-', ""), ndx),
                    description: format!("{}: {}", tool_name, description),
                    input_schema,
                },
                backend: ToolBackend::Mcp {
                    server: Box::new(server.clone()),
                    tool_name: tool_name.to_string(),
                    auth_token: auth_token.clone(),
                },
            });
        }
    }

    result
}

/// Persist executed tool calls into the assistant message metadata
/// (toolCalls + tools, Node parity) and re-publish the final message so
/// subscribers get the tool badges.
async fn record_tool_metadata(
    gql_ctx: &GraphQLContext,
    chat_id: &str,
    message_id: &str,
    executed: &[crate::services::ai::ExecutedToolCall],
) -> Result<(), AppError> {
    let mut conn = gql_ctx
        .db_pool
        .get()
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut message: Message = messages::table
        .filter(messages::id.eq(message_id))
        .first(&mut conn)
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut metadata: crate::models::MessageMetadata = message
        .metadata
        .as_deref()
        .and_then(|m| serde_json::from_str(m).ok())
        .unwrap_or_default();
    metadata.tool_calls = Some(
        executed
            .iter()
            .map(|call| crate::models::ChatToolCall {
                name: call.name.clone(),
                call_id: Some(call.id.clone()),
                type_: Some("function".to_string()),
                error: None,
                args: Some(call.args_json.clone()),
            })
            .collect(),
    );
    metadata.tools = Some(
        executed
            .iter()
            .map(|call| crate::models::ChatToolCallResult {
                call_id: Some(call.id.clone()),
                name: call.name.clone(),
                content: call.content.clone(),
            })
            .collect(),
    );

    let metadata_json = serde_json::to_string(&metadata)
        .map_err(|e| AppError::Internal(format!("Failed to serialize metadata: {}", e)))?;
    diesel::update(messages::table.filter(messages::id.eq(message_id)))
        .set((
            messages::metadata.eq(metadata_json.clone()),
            messages::updated_at.eq(Utc::now().naive_utc()),
        ))
        .execute(&mut conn)
        .map_err(|e| AppError::Database(e.to_string()))?;

    message.metadata = Some(metadata_json);
    let pub_message = message::GqlNewMessage {
        r#type: String::from(message::MessageType::Message),
        error: None,
        message: Some(GqlMessage::from(message)),
        streaming: Some(false),
        chat: None,
    };
    if let Err(e) = get_global_pubsub()
        .publish_to_chat(chat_id, pub_message)
        .await
    {
        warn!("Failed to publish tool metadata update: {:?}", e);
    }
    Ok(())
}

/// Convert database Message to AI service ModelMessage format
fn convert_messages_to_model_format(
    messages: &[Message],
) -> Vec<crate::services::ai::ModelMessage> {
    messages
        .iter()
        .map(|msg| crate::services::ai::ModelMessage {
            role: match msg.role.to_lowercase().as_str() {
                "assistant" => crate::services::ai::MessageRole::Assistant,
                "system" => crate::services::ai::MessageRole::System,
                _ => crate::services::ai::MessageRole::User,
            },
            content: msg.content.clone(),
            timestamp: Some(msg.created_at.and_utc()),
            tool_calls: None,
            tool_call_id: None,
        })
        .collect()
}

/// Preprocess messages: sort by timestamp and join consecutive messages from the same role
fn preprocess_messages(
    mut messages: Vec<crate::services::ai::ModelMessage>,
) -> Vec<crate::services::ai::ModelMessage> {
    if messages.is_empty() {
        return messages;
    }

    // Sort messages by timestamp, with role-based tiebreaking
    messages.sort_by(|a, b| {
        let a_time = a.timestamp.unwrap_or_else(Utc::now);
        let b_time = b.timestamp.unwrap_or_else(Utc::now);

        if a_time == b_time {
            // If same timestamp, sort by role (user messages first)
            match (&a.role, &b.role) {
                (
                    crate::services::ai::MessageRole::User,
                    crate::services::ai::MessageRole::User,
                ) => std::cmp::Ordering::Equal,
                (crate::services::ai::MessageRole::User, _) => std::cmp::Ordering::Less,
                (_, crate::services::ai::MessageRole::User) => std::cmp::Ordering::Greater,
                _ => std::cmp::Ordering::Equal,
            }
        } else {
            a_time.cmp(&b_time)
        }
    });

    // Join consecutive messages from the same role
    let mut result: Vec<crate::services::ai::ModelMessage> = Vec::new();

    for msg in messages {
        if msg.content.trim().is_empty() {
            continue; // Skip empty messages
        }

        if let Some(last_msg) = result.last_mut() {
            if last_msg.role == msg.role {
                // Same role - check for duplicates and join
                if last_msg.content == msg.content {
                    // Skip duplicate messages
                    continue;
                }
                // Join messages with newline
                last_msg.content.push('\n');
                last_msg.content.push_str(&msg.content);
            } else {
                // Different role - add as new message
                result.push(msg);
            }
        } else {
            // First message
            result.push(msg);
        }
    }

    result
}
