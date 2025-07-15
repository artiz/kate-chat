use chrono::Utc;
use diesel::prelude::*;
use oauth2::basic::BasicClient;
use oauth2::reqwest::async_http_client;
use oauth2::{AuthorizationCode, CsrfToken, Scope, TokenResponse};
use reqwest;
use rocket::form::FromForm;
use rocket::serde::{Deserialize, Serialize};
use rocket::{get, response::Redirect, routes, Route, State};
use tracing::{info, warn};

use crate::config::AppConfig;
use crate::database::DbPool;
use crate::models::*;
use crate::schema::*;
use crate::utils::errors::AppError;
use crate::utils::jwt;

#[derive(Serialize, Deserialize, FromForm)]
pub struct OAuthCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

#[derive(Deserialize)]
struct GoogleUserInfo {
    id: String,
    email: String,
    name: String,
    picture: Option<String>,
}

#[derive(Deserialize)]
struct GitHubUserInfo {
    id: i64,
    login: String,
    name: Option<String>,
    email: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct GitHubEmail {
    email: String,
    primary: bool,
    verified: bool,
}

pub fn routes() -> Vec<Route> {
    routes![google_oauth, google_callback, github_oauth, github_callback]
}

#[get("/google")]
pub async fn google_oauth(config: &State<AppConfig>) -> Result<Redirect, AppError> {
    let client_id = config
        .google_client_id
        .as_ref()
        .ok_or_else(|| AppError::Auth("Google OAuth not configured".to_string()))?;
    let client_secret = config
        .google_client_secret
        .as_ref()
        .ok_or_else(|| AppError::Auth("Google OAuth not configured".to_string()))?;
    let callback_url_base = config.callback_url_base.as_ref().ok_or_else(|| {
        AppError::Auth("Google OAuth callback URL base not configured".to_string())
    })?;

    let callback_url = format!("{}/auth/google/callback", callback_url_base);
    info!("Google OAuth callback URL: {}", callback_url);

    let client = BasicClient::new(
        oauth2::ClientId::new(client_id.clone()),
        Some(oauth2::ClientSecret::new(client_secret.clone())),
        oauth2::AuthUrl::new("https://accounts.google.com/o/oauth2/auth".to_string())
            .map_err(|e| AppError::Internal(format!("Invalid auth URL: {}", e)))?,
        Some(
            oauth2::TokenUrl::new("https://oauth2.googleapis.com/token".to_string())
                .map_err(|e| AppError::Internal(format!("Invalid token URL: {}", e)))?,
        ),
    )
    .set_redirect_uri(
        oauth2::RedirectUrl::new(callback_url)
            .map_err(|e| AppError::Internal(format!("Invalid redirect URL: {}", e)))?,
    );

    // IMPROVEMENT: Implement PKCE for better security
    // let (pkce_challenge, _pkce_verifier) = PkceCodeChallenge::new_random_sha256();
    let (auth_url, _csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("openid".to_string()))
        .add_scope(Scope::new("email".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        //.set_pkce_challenge(pkce_challenge)
        .url();

    Ok(Redirect::to(auth_url.to_string()))
}

#[get("/google/callback?<query..>")]
pub async fn google_callback(
    query: OAuthCallbackQuery,
    config: &State<AppConfig>,
    db_pool: &State<DbPool>,
) -> Result<Redirect, AppError> {
    // Check for OAuth error
    if let Some(error) = query.error {
        return Err(AppError::Auth(format!("OAuth error: {}", error)));
    }

    // Get authorization code
    let code = query
        .code
        .ok_or_else(|| AppError::Auth("No authorization code received".to_string()))?;

    let client_id = config
        .google_client_id
        .as_ref()
        .ok_or_else(|| AppError::Auth("Google OAuth not configured".to_string()))?;
    let client_secret = config
        .google_client_secret
        .as_ref()
        .ok_or_else(|| AppError::Auth("Google OAuth not configured".to_string()))?;
    let callback_url_base = config.callback_url_base.as_ref().ok_or_else(|| {
        AppError::Auth("Google OAuth callback URL base not configured".to_string())
    })?;

    let frontend_url = config
        .frontend_url
        .as_ref()
        .ok_or_else(|| AppError::Auth("Frontend URL not configured".to_string()))?;

    let client = BasicClient::new(
        oauth2::ClientId::new(client_id.clone()),
        Some(oauth2::ClientSecret::new(client_secret.clone())),
        oauth2::AuthUrl::new("https://accounts.google.com/o/oauth2/auth".to_string())
            .map_err(|e| AppError::Internal(format!("Invalid auth URL: {}", e)))?,
        Some(
            oauth2::TokenUrl::new("https://oauth2.googleapis.com/token".to_string())
                .map_err(|e| AppError::Internal(format!("Invalid token URL: {}", e)))?,
        ),
    )
    .set_redirect_uri(
        oauth2::RedirectUrl::new(format!("{}/auth/google/callback", callback_url_base))
            .map_err(|e| AppError::Internal(format!("Invalid redirect URL: {}", e)))?,
    );

    // Exchange authorization code for access token
    let token_result = client
        .exchange_code(AuthorizationCode::new(code))
        .request_async(async_http_client)
        .await
        .map_err(|e| {
            warn!("Failed to exchange code for token: {:?}", e);
            AppError::Auth(format!("Failed to exchange code for token: {}", e))
        })?;

    let access_token = token_result.access_token();

    // Get user info from Google
    let user_info_url = "https://www.googleapis.com/oauth2/v2/userinfo";
    let http_client = reqwest::Client::new();

    let response = http_client
        .get(user_info_url)
        .bearer_auth(access_token.secret())
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to fetch user info: {}", e)))?;

    if !response.status().is_success() {
        return Err(AppError::Auth(
            "Failed to fetch user info from Google".to_string(),
        ));
    }

    let user_info: GoogleUserInfo = response
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to parse user info: {}", e)))?;

    let mut conn = db_pool
        .get()
        .map_err(|e| AppError::Database(e.to_string()))?;

    info!("Google user registration: {}", user_info.email);

    // Check if user already exists
    let existing_user: Option<User> = users::table
        .filter(users::email.eq(&user_info.email))
        .first(&mut conn)
        .optional()
        .map_err(|e| AppError::Database(e.to_string()))?;

    // split user_info.name into first and last name
    let name_parts: Vec<&str> = user_info.name.split_whitespace().collect();
    let first_name = name_parts.first().cloned().unwrap_or("");
    let last_name = name_parts
        .get(1..)
        .map(|parts| parts.join(" "))
        .unwrap_or_default();

        let user_role: &str = if config.default_admin_emails.contains(&user_info.email) {
            ROLE_ADMIN
        } else {
            ROLE_USER
        };


    let db_user = if let Some(user) = existing_user {
        // Update existing user
        diesel::update(users::table.filter(users::id.eq(&user.id)))
            .set((
                users::first_name.eq(first_name),
                users::last_name.eq(last_name),
                users::password.eq::<Option<String>>(None),
                users::auth_provider.eq(AuthProvider::Google.to_string()),
                users::google_id.eq(&user_info.id),
                users::updated_at.eq(Utc::now().naive_utc()),
                users::avatar_url.eq(&user_info.picture),
                users::role.eq(user_role.to_string()),
            ))
            .execute(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Fetch updated user
        users::table
            .filter(users::id.eq(&user.id))
            .first(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?
    } else {
        // Create new user
        let new_user = NewUser::new(
            user_info.email.clone(),
            None,
            first_name.to_string(),
            last_name.to_string(),
            Some(user_info.id.clone()),
            None,                                   // GitHub ID not provided
            Some(AuthProvider::Google.to_string()), // Auth provider
            user_info.picture.clone(),              // Avatar URL
            user_role.to_string(),                  // User role
        );

        let created_user: User = diesel::insert_into(users::table)
            .values(&new_user)
            .get_result(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        info!("User registration successful: {}", created_user.email);
        created_user
    };

    let token = jwt::create_token(&db_user.id, &config.jwt_secret)?;

    // Redirect to the frontend with the token
    Ok(Redirect::to(format!(
        "{}/oauth-callback?token={}",
        frontend_url, token
    )))
}

#[get("/github")]
pub async fn github_oauth(config: &State<AppConfig>) -> Result<Redirect, AppError> {
    let client_id = config
        .github_client_id
        .as_ref()
        .ok_or_else(|| AppError::Auth("GitHub OAuth not configured".to_string()))?;
    let callback_url_base = config.callback_url_base.as_ref().ok_or_else(|| {
        AppError::Auth("GitHub OAuth callback URL base not configured".to_string())
    })?;

    let callback_url = format!("{}/auth/github/callback", callback_url_base);
    info!("GitHub OAuth callback URL: {}", callback_url);

    // Generate a random state token for CSRF protection
    let state = CsrfToken::new_random();

    let auth_url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&scope=user:email&state={}&redirect_uri={}",
        client_id,
        state.secret(),
        urlencoding::encode(&callback_url)
    );

    Ok(Redirect::to(auth_url))
}

#[get("/github/callback?<query..>")]
pub async fn github_callback(
    query: OAuthCallbackQuery,
    config: &State<AppConfig>,
    db_pool: &State<DbPool>,
) -> Result<Redirect, AppError> {
    // Check for OAuth error
    if let Some(error) = query.error {
        return Err(AppError::Auth(format!("OAuth error: {}", error)));
    }

    // Get authorization code
    let code = query
        .code
        .ok_or_else(|| AppError::Auth("No authorization code received".to_string()))?;

    let client_id = config
        .github_client_id
        .as_ref()
        .ok_or_else(|| AppError::Auth("GitHub OAuth not configured".to_string()))?;
    let client_secret = config
        .github_client_secret
        .as_ref()
        .ok_or_else(|| AppError::Auth("GitHub OAuth not configured".to_string()))?;
    let callback_url_base = config.callback_url_base.as_ref().ok_or_else(|| {
        AppError::Auth("GitHub OAuth callback URL base not configured".to_string())
    })?;

    let frontend_url = config
        .frontend_url
        .as_ref()
        .ok_or_else(|| AppError::Auth("Frontend URL not configured".to_string()))?;

    let client = BasicClient::new(
        oauth2::ClientId::new(client_id.clone()),
        Some(oauth2::ClientSecret::new(client_secret.clone())),
        oauth2::AuthUrl::new("https://github.com/login/oauth/authorize".to_string())
            .map_err(|e| AppError::Internal(format!("Invalid auth URL: {}", e)))?,
        Some(
            oauth2::TokenUrl::new("https://github.com/login/oauth/access_token".to_string())
                .map_err(|e| AppError::Internal(format!("Invalid token URL: {}", e)))?,
        ),
    )
    .set_redirect_uri(
        oauth2::RedirectUrl::new(format!("{}/auth/github/callback", callback_url_base))
            .map_err(|e| AppError::Internal(format!("Invalid redirect URL: {}", e)))?,
    );

    // Exchange authorization code for access token
    let token_result = client
        .exchange_code(AuthorizationCode::new(code))
        .request_async(async_http_client)
        .await
        .map_err(|e| {
            warn!("Failed to exchange code for token: {:?}", e);
            AppError::Auth(format!("Failed to exchange code for token: {}", e))
        })?;

    let access_token = token_result.access_token();

    // Get user info from GitHub
    let http_client = reqwest::Client::new();

    // First, get basic user info
    let user_response = http_client
        .get("https://api.github.com/user")
        .bearer_auth(access_token.secret())
        .header("User-Agent", "kate-chat-backend")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to fetch user info: {}", e)))?;

    if !user_response.status().is_success() {
        return Err(AppError::Auth(
            "Failed to fetch user info from GitHub".to_string(),
        ));
    }

    let user_info: GitHubUserInfo = user_response
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to parse user info: {}", e)))?;

    // Get user emails (since email might not be public)
    let emails_response = http_client
        .get("https://api.github.com/user/emails")
        .bearer_auth(access_token.secret())
        .header("User-Agent", "kate-chat-backend")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to fetch user emails: {}", e)))?;

    let user_email = if emails_response.status().is_success() {
        let emails: Vec<GitHubEmail> = emails_response
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to parse user emails: {}", e)))?;

        // Find primary verified email, or first verified email, or first email
        emails
            .iter()
            .find(|e| e.primary && e.verified)
            .or_else(|| emails.iter().find(|e| e.verified))
            .or_else(|| emails.first())
            .map(|e| e.email.clone())
    } else {
        user_info.email.clone()
    };

    let email = user_email
        .ok_or_else(|| AppError::Auth("No email address available from GitHub".to_string()))?;

    let mut conn = db_pool
        .get()
        .map_err(|e| AppError::Database(e.to_string()))?;

    info!("GitHub user registration: {}", email);

    // Check if user already exists by GitHub ID
    let existing_user_by_github: Option<User> = users::table
        .filter(users::github_id.eq(&user_info.id.to_string()))
        .first(&mut conn)
        .optional()
        .map_err(|e| AppError::Database(e.to_string()))?;

    // Check if user already exists by email
    let existing_user_by_email: Option<User> = users::table
        .filter(users::email.eq(&email))
        .first(&mut conn)
        .optional()
        .map_err(|e| AppError::Database(e.to_string()))?;

    // Extract name from GitHub profile
    let display_name = user_info.name.unwrap_or_else(|| user_info.login.clone());
    let name_parts: Vec<&str> = display_name.split_whitespace().collect();
    let first_name = name_parts.first().cloned().unwrap_or("User");
    let last_name = name_parts
        .get(1..)
        .map(|parts| parts.join(" "))
        .unwrap_or_default();

    let user_role: &str = if config.default_admin_emails.contains(&email) {
            ROLE_ADMIN
        } else {
            ROLE_USER
        };

    let db_user = if let Some(user) = existing_user_by_github {
        // Update existing user with GitHub ID
        diesel::update(users::table.filter(users::id.eq(&user.id)))
            .set((
                users::first_name.eq(first_name),
                users::last_name.eq(last_name),
                users::password.eq::<Option<String>>(None),
                users::auth_provider.eq(AuthProvider::GitHub.to_string()),
                users::github_id.eq(&user_info.id.to_string()),
                users::updated_at.eq(Utc::now().naive_utc()),
                users::avatar_url.eq(&user_info.avatar_url),
                users::role.eq(user_role.to_string()),
            ))
            .execute(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Fetch updated user
        users::table
            .filter(users::id.eq(&user.id))
            .first(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?
    
    } else if let Some(user) = existing_user_by_email {
        // Link existing user with GitHub ID
        diesel::update(users::table.filter(users::id.eq(&user.id)))
            .set((
                users::first_name.eq(first_name),
                users::last_name.eq(last_name),
                users::password.eq::<Option<String>>(None),
                users::auth_provider.eq(AuthProvider::GitHub.to_string()),
                users::github_id.eq(&user_info.id.to_string()),
                users::updated_at.eq(Utc::now().naive_utc()),
                users::avatar_url.eq(&user_info.avatar_url),
                users::role.eq(user_role.to_string()),
            ))
            .execute(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        info!("User linked with GitHub account: {}", user.id);

        // Fetch updated user
        users::table
            .filter(users::id.eq(&user.id))
            .first(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?
    } else {
        
        // Create new user
        let new_user = NewUser::new(
            email.clone(),
            None, // No password for OAuth users
            first_name.to_string(),
            last_name.to_string(),
            None,                                   // Google ID not provided
            Some(user_info.id.to_string()),         // GitHub ID
            Some(AuthProvider::GitHub.to_string()), // Auth provider
            user_info.avatar_url.clone(),           // Avatar URL
            user_role.to_string(),                  // User role
        );

        let created_user: User = diesel::insert_into(users::table)
            .values(&new_user)
            .get_result(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        info!("User registration successful: {}", created_user.email);
        created_user
    };

    let token = jwt::create_token(&db_user.id, &config.jwt_secret)?;

    // Redirect to the frontend with the token
    Ok(Redirect::to(format!(
        "{}/oauth-callback?token={}",
        frontend_url, token
    )))
}
