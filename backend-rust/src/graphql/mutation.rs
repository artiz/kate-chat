use async_graphql::{Context, Object, Result};
use chrono::Utc;
use diesel::prelude::*;
use tracing::{error, info, instrument, warn};

use crate::graphql::GraphQLContext;
use crate::log_user_action;
use crate::models::*;
use crate::schema::*;
use crate::services::ai::{AIService, ApiProvider};
use crate::services::pubsub::get_global_pubsub;
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

        let new_user = NewUser::new(
            input.email,
            Some(hashed_password),
            input.first_name,
            input.last_name,
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
    async fn create_chat(&self, ctx: &Context<'_>, input: CreateChatInput) -> Result<Chat> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let new_chat = NewChat::new(
            input.title,
            input.description,
            Some(user.id.clone()),
            input.model_id,
        );

        let chat = diesel::insert_into(chats::table)
            .values(&new_chat)
            .get_result::<Chat>(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(chat)
    }

    /// Update chat
    async fn update_chat(
        &self,
        ctx: &Context<'_>,
        id: String,
        input: UpdateChatInput,
    ) -> Result<Chat> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        diesel::update(
            chats::table
                .filter(chats::id.eq(&id))
                .filter(chats::user_id.eq(&user.id)),
        )
        .set((
            input.title.map(|t| chats::title.eq(t)),
            input.description.map(|d| chats::description.eq(d)),
            input.model_id.map(|m| chats::model_id.eq(m)),
            input.temperature.map(|t| chats::temperature.eq(t)),
            input.max_tokens.map(|m| chats::max_tokens.eq(m)),
            input.top_p.map(|p| chats::top_p.eq(p)),
            chats::updated_at.eq(Utc::now().naive_utc()),
        ))
        .execute(&mut conn)
        .map_err(|e| AppError::Database(e.to_string()))?;

        let updated_chat: Chat = chats::table
            .filter(chats::id.eq(&id))
            .filter(chats::user_id.eq(&user.id))
            .first(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(updated_chat)
    }

    /// Delete chat
    async fn delete_chat(&self, ctx: &Context<'_>, id: String) -> Result<bool> {
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

    /// Create a new message
    async fn create_message(
        &self,
        ctx: &Context<'_>,
        input: CreateMessageInput,
    ) -> Result<Message> {
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

        let new_message = NewMessage::new(
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
            message: Some(message.clone()),
            streaming: Some(false),
        };

        if let Err(e) = pubsub.publish_to_chat(&input.chat_id, gql_message).await {
            warn!("Failed to publish message to subscribers: {:?}", e);
        }

        // Parse API provider
        let api_provider: ApiProvider = match model.api_provider.as_str() {
            "aws_bedrock" => ApiProvider::AwsBedrock,
            "open_ai" => ApiProvider::OpenAi,
            "yandex_fm" => ApiProvider::YandexFm,
            _ => return Err(async_graphql::Error::new("Unsupported API provider")),
        };
        let ai_service = AIService::new(gql_ctx.config.clone());

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

        // Create invoke request with preprocessed message context
        let invoke_request = crate::services::ai::InvokeModelRequest {
            model_id: model_id.clone(),
            messages: model_messages,
            temperature: input.temperature,
            max_tokens: input.max_tokens,
            top_p: input.top_p,
            system_prompt: user.default_system_prompt.clone(),
        };

        // Test the model
        match ai_service.invoke_model(api_provider, invoke_request).await {
            Ok(response) => {
                info!(
                    "Got response for model: {}, response length: {}",
                    model.model_id,
                    response.content.len()
                );

                let ai_msg_data = NewMessage::new(
                    input.chat_id.clone(),
                    None,
                    response.content,
                    String::from(MessageRole::Assistant),
                    model_id.clone(),
                    Some(model.name.clone()),
                );
                let ai_message = diesel::insert_into(messages::table)
                    .values(&ai_msg_data)
                    .get_result::<Message>(&mut conn)
                    .map_err(|e| AppError::Database(e.to_string()))?;

                let pub_message = message::GqlNewMessage {
                    r#type: String::from(message::MessageType::Message),
                    error: None,
                    message: Some(ai_message.clone()),
                    streaming: Some(false),
                };

                if let Err(e) = pubsub.publish_to_chat(&input.chat_id, pub_message).await {
                    warn!("Failed to publish message to subscribers: {:?}", e);
                }
            }
            Err(e) => {
                error!(
                    "Model inference failed for model: {}, error: {:?}",
                    model.model_id, e
                );
                return Err(AppError::Internal(format!("Model inference failed: {}", e)).into());
            }
        }

        Ok(message)
    }

    /// Delete message and optionally following messages
    async fn delete_message(
        &self,
        ctx: &Context<'_>,
        id: String,
        delete_following: Option<bool>,
    ) -> Result<Vec<String>> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Get the message to delete
        let message: Message = messages::table
            .filter(messages::id.eq(&id))
            .filter(messages::user_id.eq(&user.id))
            .first(&mut conn)
            .map_err(|_| async_graphql::Error::new("Message not found"))?;

        let mut deleted_ids = vec![id.clone()];

        if delete_following.unwrap_or(false) {
            // Delete all messages after this one in the same chat
            let following_messages: Vec<Message> = messages::table
                .filter(messages::chat_id.eq(&message.chat_id))
                .filter(messages::created_at.gt(&message.created_at))
                .load(&mut conn)
                .map_err(|e| AppError::Database(e.to_string()))?;

            for msg in following_messages {
                deleted_ids.push(msg.id);
            }

            diesel::delete(
                messages::table
                    .filter(messages::chat_id.eq(&message.chat_id))
                    .filter(messages::created_at.ge(&message.created_at)),
            )
            .execute(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;
        } else {
            diesel::delete(messages::table.filter(messages::id.eq(&id)))
                .execute(&mut conn)
                .map_err(|e| AppError::Database(e.to_string()))?;
        }

        Ok(deleted_ids)
    }

    /// Test a model
    #[instrument(skip(self, ctx), fields(id = %input.id, user_id = tracing::field::Empty))]
    async fn test_model(&self, ctx: &Context<'_>, input: TestModelInput) -> Result<Message> {
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

        // Parse API provider
        let api_provider: ApiProvider = match model.api_provider.as_str() {
            "aws_bedrock" => ApiProvider::AwsBedrock,
            "open_ai" => ApiProvider::OpenAi,
            "yandex_fm" => ApiProvider::YandexFm,
            _ => return Err(async_graphql::Error::new("Unsupported API provider")),
        };

        // Create AI service
        let ai_service = AIService::new(gql_ctx.config.clone());

        // Create test message
        let test_message = crate::services::ai::ModelMessage {
            role: crate::services::ai::MessageRole::User,
            content: input.text,
            timestamp: Some(Utc::now()),
        };

        // Create invoke request
        let invoke_request = crate::services::ai::InvokeModelRequest {
            model_id: model.model_id.clone(),
            messages: vec![test_message],
            temperature: Some(0.7),
            max_tokens: Some(1000),
            top_p: Some(0.9),
            system_prompt: None,
        };

        // Test the model
        match ai_service.invoke_model(api_provider, invoke_request).await {
            Ok(response) => {
                let timestamp = Utc::now().naive_utc();
                info!(
                    "Model test successful for model: {}, response length: {}",
                    model.model_id,
                    response.content.len()
                );
                log_user_action!(&user.id, "test_model", model_id = %model.model_id, provider = %model.api_provider);

                Ok(Message {
                    id: uuid::Uuid::new_v4().to_string(),
                    chat_id: "test".to_string(),
                    user_id: Some(user.id.clone()),
                    content: response.content,
                    role: "assistant".to_string(),
                    model_id: model.model_id.clone(),
                    model_name: Some(model.name.clone()),
                    created_at: timestamp,
                    updated_at: timestamp,
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
    #[instrument(skip(self, ctx), fields(user_id = tracing::field::Empty))]
    async fn reload_models(&self, ctx: &Context<'_>) -> Result<GqlModelsList> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx
            .db_pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        tracing::Span::current().record("user_id", &user.id);
        info!("Reloading models from providers for user: {}", user.id);

        // Create AI service
        let ai_service = AIService::new(gql_ctx.config.clone());

        // Get all models from enabled providers
        let all_models = ai_service.get_all_models().await.map_err(|e| {
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
                created_at: Utc::now().naive_utc(),
                updated_at: Utc::now().naive_utc(),
            };

            let saved_model = diesel::insert_into(models::table)
                .values(&new_model)
                .get_result::<Model>(&mut conn)
                .map_err(|e| AppError::Database(e.to_string()))?;

            gql_models.push(GqlModel::from_model(&saved_model, user.clone()));
        }

        // Get provider information
        let provider_info = ai_service
            .get_provider_info(true)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to get provider info: {}", e)))?;

        let gql_providers: Vec<GqlProviderInfo> = provider_info
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

        let total_count = gql_models.len() as i32;
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

/// Convert database Message to AI service ModelMessage format
fn convert_messages_to_model_format(messages: &[Message]) -> Vec<crate::services::ai::ModelMessage> {
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
        })
        .collect()
}

/// Preprocess messages: sort by timestamp and join consecutive messages from the same role
fn preprocess_messages(mut messages: Vec<crate::services::ai::ModelMessage>) -> Vec<crate::services::ai::ModelMessage> {
    if messages.is_empty() {
        return messages;
    }

    // Sort messages by timestamp, with role-based tiebreaking
    messages.sort_by(|a, b| {
        let a_time = a.timestamp.unwrap_or_else(|| Utc::now());
        let b_time = b.timestamp.unwrap_or_else(|| Utc::now());
        
        if a_time == b_time {
            // If same timestamp, sort by role (user messages first)
            match (&a.role, &b.role) {
                (crate::services::ai::MessageRole::User, crate::services::ai::MessageRole::User) => std::cmp::Ordering::Equal,
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
                } else {
                    // Join messages with newline
                    last_msg.content.push('\n');
                    last_msg.content.push_str(&msg.content);
                }
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
