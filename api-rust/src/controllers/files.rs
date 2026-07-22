use rocket::form::{Form, FromForm};
use rocket::fs::TempFile;
use rocket::http::ContentType;
use rocket::serde::json::Json;
use rocket::{delete, get, post, routes, Route, State};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::str::FromStr;
use uuid::Uuid;

use crate::config::AppConfig;
use crate::middleware::auth::AuthenticatedUser;
use crate::services::s3::S3Service;
use crate::utils::errors::AppError;

#[derive(Serialize, Deserialize)]
pub struct FileUploadResponse {
    pub url: String,
    pub key: String,
    pub message: String,
}

#[derive(Serialize, Deserialize)]
pub struct FileDeleteResponse {
    pub success: bool,
    pub message: String,
}

#[derive(FromForm)]
pub struct FileUpload<'f> {
    pub file: TempFile<'f>,
}

pub fn routes() -> Vec<Route> {
    routes![upload_file, delete_file, health_check, serve_file]
}

/// Serve a stored file (generated images, uploads) straight from S3 —
/// the client references them as `/files/<key>` URLs. Keys contain
/// slashes (`{chatId}/{messageId}/{id}.png`), hence the multi-segment
/// route. `name` mirrors the Node API's optional download-name hint.
#[get("/<key..>?<name>", rank = 20)]
pub async fn serve_file(
    key: PathBuf,
    name: Option<String>,
    config: &State<AppConfig>,
) -> Result<(ContentType, Vec<u8>), AppError> {
    let _ = name; // reserved: content-disposition hint, parity with Node API
    let key = key
        .to_str()
        .ok_or_else(|| AppError::Validation("Invalid file key".to_string()))?
        .to_string();

    let mut s3_service = S3Service::new(config.inner().clone());
    let (data, content_type) = s3_service.get_file(&key).await?;

    let content_type = content_type
        .and_then(|ct| ContentType::from_str(&ct).ok())
        .unwrap_or(ContentType::Binary);

    Ok((content_type, data))
}

#[post("/upload", data = "<upload>")]
pub async fn upload_file(
    mut upload: Form<FileUpload<'_>>,
    user: AuthenticatedUser,
    config: &State<AppConfig>,
) -> Result<Json<FileUploadResponse>, AppError> {
    let file = &mut upload.file;

    if file.len() == 0 {
        return Err(AppError::Validation("No file provided".to_string()));
    }

    // Read file data
    let path = file
        .path()
        .ok_or_else(|| AppError::Internal("File path not available".to_string()))?;
    let buffer = std::fs::read(path)
        .map_err(|e| AppError::Internal(format!("Failed to read file: {}", e)))?;

    // Generate unique key for S3
    let extension = file
        .name()
        .and_then(|name| std::path::Path::new(name).extension())
        .and_then(|ext| ext.to_str())
        .unwrap_or("bin");

    let key = format!("uploads/{}.{}", Uuid::new_v4(), extension);

    // Determine content type
    let content_type = file
        .content_type()
        .map(|ct| ct.to_string())
        .unwrap_or_else(|| "application/octet-stream".to_string());

    // Upload to S3 (profile-settings credentials over env)
    let mut s3_service = S3Service::new(config.with_user_settings(user.0.settings.as_ref()));
    let url = s3_service.upload_file(&key, buffer, &content_type).await?;

    Ok(Json(FileUploadResponse {
        url,
        key,
        message: "File uploaded successfully".to_string(),
    }))
}

#[delete("/<key>")]
pub async fn delete_file(
    key: String,
    user: AuthenticatedUser,
    config: &State<AppConfig>,
) -> Result<Json<FileDeleteResponse>, AppError> {
    let mut s3_service = S3Service::new(config.with_user_settings(user.0.settings.as_ref()));
    s3_service.delete_file(&key).await?;

    Ok(Json(FileDeleteResponse {
        success: true,
        message: "File deleted successfully".to_string(),
    }))
}

#[get("/health")]
pub async fn health_check(config: &State<AppConfig>) -> Result<Json<serde_json::Value>, AppError> {
    let mut s3_service = S3Service::new(config.inner().clone());
    let s3_connected = s3_service.test_connection().await.unwrap_or(false);
    let s3_info = s3_service.get_info();

    Ok(Json(serde_json::json!({
        "s3": {
            "connected": s3_connected,
            "info": s3_info
        }
    })))
}
