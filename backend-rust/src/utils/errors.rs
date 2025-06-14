use thiserror::Error;
use rocket::response::{Responder, Response};
use rocket::Request;
use rocket::http::{Status, ContentType};
use std::io::Cursor;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(String),
    
    #[error("Authentication error: {0}")]
    Auth(String),
    
    #[error("JWT error: {0}")]
    Jwt(String),
    
    #[error("Bcrypt error: {0}")]
    Bcrypt(String),
    
    #[error("Validation error: {0}")]
    Validation(String),
    
    #[error("Not found: {0}")]
    #[allow(dead_code)]
    NotFound(String),
    
    #[error("Internal server error: {0}")]
    Internal(String),
    
    #[error("AWS error: {0}")]
    Aws(String),
    
    #[error("HTTP client error: {0}")]
    Http(String),
}

impl Clone for AppError {
    fn clone(&self) -> Self {
        match self {
            AppError::Database(msg) => AppError::Database(msg.clone()),
            AppError::Auth(msg) => AppError::Auth(msg.clone()),
            AppError::Jwt(msg) => AppError::Jwt(msg.clone()),
            AppError::Bcrypt(msg) => AppError::Bcrypt(msg.clone()),
            AppError::Validation(msg) => AppError::Validation(msg.clone()),
            AppError::NotFound(msg) => AppError::NotFound(msg.clone()),
            AppError::Internal(msg) => AppError::Internal(msg.clone()),
            AppError::Aws(msg) => AppError::Aws(msg.clone()),
            AppError::Http(msg) => AppError::Http(msg.clone()),
        }
    }
}

impl From<diesel::result::Error> for AppError {
    fn from(err: diesel::result::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

impl From<jsonwebtoken::errors::Error> for AppError {
    fn from(err: jsonwebtoken::errors::Error) -> Self {
        AppError::Jwt(err.to_string())
    }
}

impl From<bcrypt::BcryptError> for AppError {
    fn from(err: bcrypt::BcryptError) -> Self {
        AppError::Bcrypt(err.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        AppError::Http(err.to_string())
    }
}

impl<'r> Responder<'r, 'static> for AppError {
    fn respond_to(self, _: &'r Request<'_>) -> Result<Response<'static>, Status> {
        let (status, message) = match self {
            AppError::Auth(_) => (Status::Unauthorized, self.to_string()),
            AppError::NotFound(_) => (Status::NotFound, self.to_string()),
            AppError::Validation(_) => (Status::BadRequest, self.to_string()),
            _ => (Status::InternalServerError, self.to_string()),
        };

        let error_json = serde_json::json!({
            "error": message,
            "status": status.code
        });

        Response::build()
            .status(status)
            .header(ContentType::JSON)
            .sized_body(error_json.to_string().len(), Cursor::new(error_json.to_string()))
            .ok()
    }
}

