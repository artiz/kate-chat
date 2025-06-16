use diesel::prelude::*;
use chrono::Utc;
use async_graphql::{Context, Object, Result};

use crate::models::*;
use crate::graphql::GraphQLContext;
use crate::schema::*;
use crate::utils::jwt;

#[derive(Default)]
pub struct Mutation;

#[Object]

impl Mutation {
    /// Register a new user
    async fn register(&self, ctx: &Context<'_>, input: RegisterInput) -> Result<AuthResponse> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let mut conn = gql_ctx.db_pool.get().map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        // Check if user already exists
        let existing_user: Option<User> = users::table
            .filter(users::email.eq(&input.email))
            .first(&mut conn)
            .optional()
            .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        if existing_user.is_some() {
            return Err(async_graphql::Error::new("User already exists"));
        }

        // Hash password
        let hashed_password = bcrypt::hash(&input.password, bcrypt::DEFAULT_COST)
            .map_err(|e| async_graphql::Error::new(format!("Password hashing error: {}", e)))?;

        let new_user = NewUser::new(
            input.email,
            Some(hashed_password),
            input.first_name,
            input.last_name,
        );

        diesel::insert_into(users::table)
            .values(&new_user)
            .execute(&mut conn)
            .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;
        
        let user: User = users::table
            .filter(users::email.eq(&new_user.email))
            .first(&mut conn)
            .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        let token = jwt::create_token(&user.id, &gql_ctx.config.jwt_secret)?;

        Ok(AuthResponse { token, user })
    }

    /// Login user
    async fn login(&self, ctx: &Context<'_>, input: LoginInput) -> Result<AuthResponse> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let mut conn = gql_ctx.db_pool.get().map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        let user: User = users::table
            .filter(users::email.eq(&input.email))
            .first(&mut conn)
            .map_err(|_| async_graphql::Error::new("Invalid credentials"))?;

        if let Some(password_hash) = &user.password {
            let valid = bcrypt::verify(&input.password, password_hash)
                .map_err(|e| async_graphql::Error::new(format!("Password verification error: {}", e)))?;

            if !valid {
                return Err(async_graphql::Error::new("Invalid credentials"));
            }
        } else {
            return Err(async_graphql::Error::new("Invalid credentials"));
        }

        let token = jwt::create_token(&user.id, &gql_ctx.config.jwt_secret)?;

        Ok(AuthResponse { token, user })
    }

    /// Update user information
    async fn update_user(&self, ctx: &Context<'_>, input: UpdateUserInput) -> Result<User> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get().map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        diesel::update(users::table.filter(users::id.eq(&user.id)))
            .set((
                input.email.map(|e| users::email.eq(e)),
                input.first_name.map(|f| users::first_name.eq(f)),
                input.last_name.map(|l| users::last_name.eq(l)),
                input.default_model_id.map(|m| users::default_model_id.eq(m)),
                input.default_system_prompt.map(|p| users::default_system_prompt.eq(p)),
                input.avatar_url.map(|a| users::avatar_url.eq(a)),
                users::updated_at.eq(Utc::now().naive_utc()),
            ))
            .execute(&mut conn)
            .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;
        
        let updated_user: User = users::table
            .filter(users::id.eq(&user.id))
            .first(&mut conn)
            .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        Ok(updated_user)
    }

    /// Create a new chat
    async fn create_chat(&self, ctx: &Context<'_>, input: CreateChatInput) -> Result<Chat> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get().map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        let new_chat = NewChat::new(
            input.title,
            input.description,
            Some(user.id.clone()),
            input.model_id,
        );

        diesel::insert_into(chats::table)
            .values(&new_chat)
            .execute(&mut conn)
            .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;
        
        let chat: Chat = chats::table
            .filter(chats::id.eq(&new_chat.id))
            .first(&mut conn)
            .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        Ok(chat)
    }

    /// Update chat
    async fn update_chat(&self, ctx: &Context<'_>, id: String, input: UpdateChatInput) -> Result<Chat> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get().map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        diesel::update(
            chats::table
                .filter(chats::id.eq(&id))
                .filter(chats::user_id.eq(&user.id))
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
        .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;
        
        let updated_chat: Chat = chats::table
            .filter(chats::id.eq(&id))
            .filter(chats::user_id.eq(&user.id))
            .first(&mut conn)
            .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        Ok(updated_chat)
    }

    /// Delete chat
    async fn delete_chat(&self, ctx: &Context<'_>, id: String) -> Result<bool> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get().map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        let deleted_count = diesel::delete(
            chats::table
                .filter(chats::id.eq(&id))
                .filter(chats::user_id.eq(&user.id))
        )
        .execute(&mut conn)
        .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        Ok(deleted_count > 0)
    }

    /// Create a new message
    async fn create_message(&self, ctx: &Context<'_>, input: CreateMessageInput) -> Result<Message> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get().map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        // Verify chat belongs to user
        let chat: Chat = chats::table
            .filter(chats::id.eq(&input.chat_id))
            .filter(chats::user_id.eq(&user.id))
            .first(&mut conn)
            .map_err(|_| async_graphql::Error::new("Chat not found"))?;

        let model_id = input.model_id.unwrap_or_else(|| 
            chat.model_id.clone().unwrap_or_else(|| "default".to_string())
        );

        let new_message = NewMessage::new(
            input.chat_id.clone(),
            Some(user.id.clone()),
            input.content,
            input.role.unwrap_or_else(|| "user".to_string()),
            model_id.clone(),
            None,
        );

        diesel::insert_into(messages::table)
            .values(&new_message)
            .execute(&mut conn)
            .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;
        
        let message: Message = messages::table
            .filter(messages::id.eq(&new_message.id))
            .first(&mut conn)
            .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        // TODO: Generate AI response
        // let ai_service = AiService::new(config);
        // let ai_response = ai_service.generate_response(&input, &chat).await?;

        Ok(message)
    }

    /// Delete message and optionally following messages
    async fn delete_message(&self, ctx: &Context<'_>, id: String, delete_following: Option<bool>) -> Result<Vec<String>> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get().map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

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
                .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

            for msg in following_messages {
                deleted_ids.push(msg.id);
            }

            diesel::delete(
                messages::table
                    .filter(messages::chat_id.eq(&message.chat_id))
                    .filter(messages::created_at.ge(&message.created_at))
            )
            .execute(&mut conn)
            .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;
        } else {
            diesel::delete(messages::table.filter(messages::id.eq(&id)))
                .execute(&mut conn)
                .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;
        }

        Ok(deleted_ids)
    }

    /// Test a model
    async fn test_model(&self, ctx: &Context<'_>, input: TestModelInput) -> Result<Message> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;

        // TODO: Implement actual model testing
        let test_content = input.text.unwrap_or_else(|| "2+2=".to_string());
        
        let test_message = Message {
            id: uuid::Uuid::new_v4().to_string(),
            chat_id: "test".to_string(),
            user_id: Some(user.id.clone()),
            content: format!("Test response for: {}", test_content),
            role: "assistant".to_string(),
            model_id: input.model_id,
            model_name: Some("Test Model".to_string()),
            created_at: Utc::now().naive_utc(),
            updated_at: Utc::now().naive_utc(),
        };

        Ok(test_message)
    }

    /// Update model status (active/inactive)
    async fn update_model_status(&self, ctx: &Context<'_>, input: UpdateModelStatusInput) -> Result<GqlModel> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let user = gql_ctx.require_user()?;
        let mut conn = gql_ctx.db_pool.get().map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        diesel::update(
            models::table
                .filter(models::model_id.eq(&input.model_id))
                .filter(models::user_id.eq(&user.id))
        )
        .set((
            models::is_active.eq(input.is_active),
            models::updated_at.eq(Utc::now().naive_utc()),
        ))
        .execute(&mut conn)
        .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;
        
        let updated_model: Model = models::table
            .filter(models::model_id.eq(&input.model_id))
            .filter(models::user_id.eq(&user.id))
            .first(&mut conn)
            .map_err(|e| async_graphql::Error::new(format!("Database error: {}", e)))?;

        Ok(GqlModel {
            id: updated_model.id,
            name: updated_model.name,
            description: updated_model.description,
            model_id: updated_model.model_id,
            api_provider: updated_model.api_provider,
            provider: updated_model.provider,
            is_active: updated_model.is_active,
            is_custom: updated_model.is_custom,
            supports_text_in: updated_model.supports_text_in,
            supports_text_out: updated_model.supports_text_out,
            supports_image_in: updated_model.supports_image_in,
            supports_image_out: updated_model.supports_image_out,
            supports_embeddings_in: updated_model.supports_embeddings_in,
            supports_embeddings_out: updated_model.supports_embeddings_out,
            supports_streaming: updated_model.supports_streaming,
            user: user.clone(),
            created_at: updated_model.created_at,
            updated_at: updated_model.updated_at,
        })
    }

    /// Reload models from providers
    async fn reload_models(&self, ctx: &Context<'_>) -> Result<GqlModelsList> {
        let gql_ctx = ctx.data::<GraphQLContext>()?;
        let _user = gql_ctx.require_user()?;
        // TODO: Implement actual model reloading from providers
        
        Ok(GqlModelsList {
            models: vec![],
            providers: vec![],
            total: Some(0),
            error: None,
        })
    }
}
