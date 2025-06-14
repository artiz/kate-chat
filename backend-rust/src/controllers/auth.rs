use rocket::{Route, routes, get, response::Redirect, State};
use rocket::serde::json::Json;
use rocket::serde::{Deserialize, Serialize};
use rocket::form::FromForm;
use oauth2::{CsrfToken, PkceCodeChallenge, Scope};
use oauth2::basic::BasicClient;

use crate::config::AppConfig;
use crate::models::{AuthResponse};
use crate::utils::errors::AppError;

#[derive(Serialize, Deserialize, FromForm)]
pub struct OAuthCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

pub fn routes() -> Vec<Route> {
    routes![
        google_oauth,
        google_callback,
        github_oauth, 
        github_callback
    ]
}

#[get("/google")]
pub async fn google_oauth(config: &State<AppConfig>) -> Result<Redirect, AppError> {
    let client_id = config.google_client_id.as_ref()
        .ok_or_else(|| AppError::Auth("Google OAuth not configured".to_string()))?;
    
    let client_secret = config.google_client_secret.as_ref()
        .ok_or_else(|| AppError::Auth("Google OAuth not configured".to_string()))?;

    let client = BasicClient::new(
        oauth2::ClientId::new(client_id.clone()),
        Some(oauth2::ClientSecret::new(client_secret.clone())),
        oauth2::AuthUrl::new("https://accounts.google.com/o/oauth2/auth".to_string())
            .map_err(|e| AppError::Internal(format!("Invalid auth URL: {}", e)))?,
        Some(oauth2::TokenUrl::new("https://oauth2.googleapis.com/token".to_string())
            .map_err(|e| AppError::Internal(format!("Invalid token URL: {}", e)))?),
    )
    .set_redirect_uri(
        oauth2::RedirectUrl::new("http://localhost:4000/auth/google/callback".to_string())
            .map_err(|e| AppError::Internal(format!("Invalid redirect URL: {}", e)))?,
    );

    let (pkce_challenge, _pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    let (auth_url, _csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("openid".to_string()))
        .add_scope(Scope::new("email".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .set_pkce_challenge(pkce_challenge)
        .url();

    Ok(Redirect::to(auth_url.to_string()))
}

#[get("/google/callback?<_query..>")]
pub async fn google_callback(
    _query: OAuthCallbackQuery,
    _config: &State<AppConfig>,
) -> Result<Json<AuthResponse>, AppError> {
    // TODO: Implement Google OAuth callback
    // This would involve:
    // 1. Exchange authorization code for access token
    // 2. Use access token to get user info from Google
    // 3. Create or update user in database
    // 4. Generate JWT token
    // 5. Return AuthResponse
    
    Err(AppError::Internal("OAuth callback not yet implemented".to_string()))
}

#[get("/github")]
pub async fn github_oauth(config: &State<AppConfig>) -> Result<Redirect, AppError> {
    let client_id = config.github_client_id.as_ref()
        .ok_or_else(|| AppError::Auth("GitHub OAuth not configured".to_string()))?;

    let auth_url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&scope=user:email&state={}",
        client_id,
        "random-state" // TODO: Generate proper CSRF token
    );

    Ok(Redirect::to(auth_url))
}

#[get("/github/callback?<_query..>")]
pub async fn github_callback(
    _query: OAuthCallbackQuery,
    _config: &State<AppConfig>,
) -> Result<Json<AuthResponse>, AppError> {
    // TODO: Implement GitHub OAuth callback
    Err(AppError::Internal("OAuth callback not yet implemented".to_string()))
}
