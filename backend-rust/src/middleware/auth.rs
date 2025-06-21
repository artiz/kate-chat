use diesel::prelude::*;
use rocket::{
    http::Status,
    request::{self, FromRequest},
    Request,
};
use tracing::{debug, warn};

use crate::config::AppConfig;
use crate::database::DbPool;
use crate::log_security_event;
use crate::models::User;
use crate::schema::users;
use crate::utils::jwt::{extract_token_from_header, verify_token, Claims};

pub struct AuthenticatedUser(pub User);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for AuthenticatedUser {
    type Error = &'static str;

    async fn from_request(req: &'r Request<'_>) -> request::Outcome<Self, Self::Error> {
        let config = match req.guard::<&rocket::State<AppConfig>>().await {
            request::Outcome::Success(config) => config,
            _ => return request::Outcome::Error((Status::InternalServerError, "Config not found")),
        };

        let db_pool = match req.guard::<&rocket::State<DbPool>>().await {
            request::Outcome::Success(pool) => pool,
            _ => {
                return request::Outcome::Error((
                    Status::InternalServerError,
                    "Database not available",
                ))
            }
        };

        let auth_header = match req.headers().get_one("Authorization") {
            Some(header) => header,
            None => {
                debug!("No Authorization header found in request");
                return request::Outcome::Forward(Status::Unauthorized);
            }
        };

        let token = match extract_token_from_header(auth_header) {
            Some(token) => token,
            None => {
                warn!("Invalid Authorization header format");
                log_security_event!("invalid_auth_header_format",);
                return request::Outcome::Error((
                    Status::Unauthorized,
                    "Invalid auth header format",
                ));
            }
        };

        let claims = match verify_token(token, &config.jwt_secret) {
            Ok(claims) => claims,
            Err(e) => {
                warn!("Token verification failed: {}", e);
                log_security_event!("token_verification_failed", error = %e);
                return request::Outcome::Error((Status::Unauthorized, "Invalid token"));
            }
        };

        let mut conn = match db_pool.get() {
            Ok(conn) => conn,
            Err(_) => {
                return request::Outcome::Error((
                    Status::InternalServerError,
                    "Database connection failed",
                ))
            }
        };

        let user = match users::table
            .filter(users::id.eq(&claims.sub))
            .first::<User>(&mut conn)
        {
            Ok(user) => {
                debug!("Authentication successful for user: {}", user.id);
                user
            }
            Err(e) => {
                warn!(
                    "User not found in database for ID: {}, error: {}",
                    claims.sub, e
                );
                log_security_event!("user_not_found", user_id = %claims.sub);
                return request::Outcome::Error((Status::Unauthorized, "User not found"));
            }
        };

        request::Outcome::Success(AuthenticatedUser(user))
    }
}

#[derive(Debug)]
pub struct OptionalUser(pub Option<User>);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for OptionalUser {
    type Error = &'static str;

    async fn from_request(req: &'r Request<'_>) -> request::Outcome<Self, Self::Error> {
        match AuthenticatedUser::from_request(req).await {
            request::Outcome::Success(AuthenticatedUser(user)) => {
                request::Outcome::Success(OptionalUser(Some(user)))
            }
            _ => request::Outcome::Success(OptionalUser(None)),
        }
    }
}

#[allow(dead_code)]
pub async fn get_user_from_token(
    token: &str,
    jwt_secret: &str,
    db_pool: &DbPool,
) -> Result<User, String> {
    let claims = verify_token(token, jwt_secret).map_err(|_| "Invalid token".to_string())?;

    let mut conn = db_pool
        .get()
        .map_err(|_| "Database connection failed".to_string())?;

    let user = users::table
        .filter(users::id.eq(&claims.sub))
        .first::<User>(&mut conn)
        .map_err(|_| "User not found".to_string())?;

    Ok(user)
}

// Simple function for WebSocket authentication - returns token claims only
#[allow(dead_code)]
pub fn get_user_from_websocket_token(auth_header: Option<&str>) -> Option<Claims> {
    let auth_header = auth_header?;
    let token = extract_token_from_header(auth_header)?;

    // For WebSocket auth, we'll use a default secret for now
    // In production, this should come from config
    let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "default_secret".to_string());

    match verify_token(token, &jwt_secret) {
        Ok(claims) => Some(claims),
        Err(e) => {
            warn!("WebSocket token verification failed: {}", e);
            None
        }
    }
}
