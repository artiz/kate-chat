use diesel::prelude::*;
use rocket::data::ToByteUnit;
use rocket::http::ContentType;
use rocket::serde::json::Json;
use rocket::{delete, get, post, routes, Data, Route, State};
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::path::PathBuf;
use std::str::FromStr;
use tracing::{info, warn};
use uuid::Uuid;

use crate::config::AppConfig;
use crate::database::DbPool;
use crate::middleware::auth::AuthenticatedUser;
use crate::models::document::{
    ChatDocument, Document, GqlDocument, GqlDocumentStatusMessage, DOCUMENT_STATUS_ERROR,
    DOCUMENT_STATUS_PARSING, DOCUMENT_STATUS_STORAGE_UPLOAD, DOCUMENT_STATUS_UPLOAD,
};
use crate::schema::{chat_documents, chats, documents};
use crate::services::pubsub::get_global_pubsub;
use crate::services::s3::S3Service;
use crate::services::sqs::SqsService;
use crate::utils::errors::AppError;

#[derive(Serialize, Deserialize)]
pub struct FileDeleteResponse {
    pub success: bool,
    pub message: String,
}

pub fn routes() -> Vec<Route> {
    routes![upload_documents, delete_file, health_check, serve_file]
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

/// RAG documents upload (Node parity: files.controller `POST /upload`).
/// Multipart form where each part's field name is the file name; responds
/// with the created/existing `Document[]`. Files are deduplicated by
/// sha256+size per user, stored to S3 at `document/{userId}/{documentId}`
/// and queued for parsing via SQS.
#[post("/upload?<chatId>", data = "<data>")]
#[allow(non_snake_case)]
pub async fn upload_documents(
    chatId: Option<String>,
    data: Data<'_>,
    content_type: &ContentType,
    user: AuthenticatedUser,
    config: &State<AppConfig>,
    db_pool: &State<DbPool>,
) -> Result<Json<Vec<GqlDocument>>, AppError> {
    let boundary = content_type
        .params()
        .find(|(k, _)| *k == "boundary")
        .map(|(_, v)| v.to_string())
        .ok_or_else(|| AppError::Validation("Multipart form data expected".to_string()))?;

    let effective_config = config.with_user_settings(user.0.settings.as_ref());
    let mut s3_service = S3Service::new(effective_config.clone());
    let sqs = match SqsService::new(&effective_config).await {
        Ok(sqs) if effective_config.sqs_documents_queue.is_some() => Some(sqs),
        _ => None,
    };

    let stream = data.open(256.mebibytes());
    let reader = tokio_util::io::ReaderStream::new(stream);
    let mut multipart = multer::Multipart::new(reader, boundary);

    let mut result: Vec<GqlDocument> = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::Validation(format!("Invalid multipart data: {}", e)))?
    {
        let file_name = field
            .file_name()
            .map(|s| s.to_string())
            .or_else(|| field.name().map(|s| s.to_string()))
            .unwrap_or_else(|| "upload".to_string());
        let mime = field.content_type().map(|m| m.to_string());
        let bytes = field
            .bytes()
            .await
            .map_err(|e| AppError::Validation(format!("Failed to read upload: {}", e)))?;
        if bytes.is_empty() {
            continue;
        }

        let checksum = hex::encode(sha2::Sha256::digest(&bytes));
        let document = upload_document(
            &user,
            db_pool,
            &mut s3_service,
            sqs.as_ref(),
            &effective_config,
            chatId.as_deref(),
            file_name,
            mime,
            bytes.to_vec(),
            checksum,
        )
        .await?;
        result.push(GqlDocument::from(document));
    }

    if result.is_empty() {
        return Err(AppError::Validation("No files provided".to_string()));
    }
    Ok(Json(result))
}

#[allow(clippy::too_many_arguments)]
async fn upload_document(
    user: &AuthenticatedUser,
    db_pool: &DbPool,
    s3_service: &mut S3Service,
    sqs: Option<&SqsService>,
    config: &AppConfig,
    chat_id: Option<&str>,
    file_name: String,
    mime: Option<String>,
    bytes: Vec<u8>,
    checksum: String,
) -> Result<Document, AppError> {
    let user_id = user.0.id.clone();
    let file_size = bytes.len() as i64;
    let mut conn = db_pool
        .get()
        .map_err(|e| AppError::Database(e.to_string()))?;
    let pubsub = get_global_pubsub();

    let link_to_chat =
        |conn: &mut crate::database::DbConnection, document_id: &str| -> Result<(), AppError> {
            let Some(chat_id) = chat_id.filter(|c| !c.is_empty()) else {
                return Ok(());
            };
            let owned: i64 = chats::table
                .filter(chats::id.eq(chat_id))
                .filter(chats::user_id.eq(&user_id))
                .count()
                .get_result(conn)
                .map_err(|e| AppError::Database(e.to_string()))?;
            if owned == 0 {
                return Err(AppError::Validation(format!(
                    "Chat not found, id: {}",
                    chat_id
                )));
            }
            let exists: i64 = chat_documents::table
                .filter(chat_documents::chat_id.eq(chat_id))
                .filter(chat_documents::document_id.eq(document_id))
                .count()
                .get_result(conn)
                .map_err(|e| AppError::Database(e.to_string()))?;
            if exists == 0 {
                diesel::insert_into(chat_documents::table)
                    .values(ChatDocument {
                        id: Uuid::new_v4().to_string(),
                        chat_id: chat_id.to_string(),
                        document_id: document_id.to_string(),
                    })
                    .execute(conn)
                    .map_err(|e| AppError::Database(e.to_string()))?;
            }
            diesel::update(chats::table.filter(chats::id.eq(chat_id)))
                .set(chats::is_pristine.eq(false))
                .execute(conn)
                .map_err(|e| AppError::Database(e.to_string()))?;
            Ok(())
        };

    // Deduplicate by checksum + size per user
    let existing: Option<Document> = documents::table
        .filter(documents::sha256checksum.eq(&checksum))
        .filter(documents::file_size.eq(file_size))
        .filter(documents::owner_id.eq(&user_id))
        .first(&mut conn)
        .optional()
        .map_err(|e| AppError::Database(e.to_string()))?;

    if let Some(mut existing) = existing {
        link_to_chat(&mut conn, &existing.id)?;

        // A document stuck in `upload` (or without an S3 key) never made
        // it to storage — run the full store + queue flow again
        if existing.status == DOCUMENT_STATUS_UPLOAD
            || existing.s3key.as_deref().unwrap_or_default().is_empty()
        {
            store_and_queue(&mut existing, &mut conn, s3_service, sqs, config, bytes).await?;
        } else if matches!(
            existing.status.as_str(),
            DOCUMENT_STATUS_STORAGE_UPLOAD | DOCUMENT_STATUS_PARSING | DOCUMENT_STATUS_ERROR
        ) {
            // Made it to storage but not through parsing — re-kick
            enqueue_parse(&mut existing, &mut conn, sqs, config).await;
        }
        return Ok(existing);
    }

    let now = chrono::Utc::now().naive_utc();
    let mut document = Document {
        id: Uuid::new_v4().to_string(),
        file_name,
        mime,
        file_size,
        sha256checksum: checksum,
        s3key: Some(String::new()),
        owner_id: user_id.clone(),
        embeddings_model_id: None,
        summary_model_id: None,
        summary: None,
        pages_count: 0,
        status: DOCUMENT_STATUS_UPLOAD.to_string(),
        status_info: None,
        status_progress: 1.0,
        created_at: now,
        updated_at: now,
        metadata: None,
    };
    diesel::insert_into(documents::table)
        .values(&document)
        .execute(&mut conn)
        .map_err(|e| AppError::Database(e.to_string()))?;
    pubsub.publish_document_status(GqlDocumentStatusMessage::from_document(&document));

    link_to_chat(&mut conn, &document.id)?;
    store_and_queue(&mut document, &mut conn, s3_service, sqs, config, bytes).await?;

    Ok(document)
}

/// Upload the payload to S3 and enqueue the parse command, moving the
/// document through `upload` → `storage_upload` (or `error` with a
/// visible reason — the row must never silently stay in `upload`).
async fn store_and_queue(
    document: &mut Document,
    conn: &mut crate::database::DbConnection,
    s3_service: &mut S3Service,
    sqs: Option<&SqsService>,
    config: &AppConfig,
    bytes: Vec<u8>,
) -> Result<(), AppError> {
    let s3key = format!("document/{}/{}", document.owner_id, document.id);
    let content_type = document
        .mime
        .clone()
        .unwrap_or_else(|| "application/octet-stream".to_string());

    if let Err(e) = s3_service.upload_file(&s3key, bytes, &content_type).await {
        set_document_error(document, conn, &format!("S3 upload failed: {}", e));
        return Err(e);
    }

    document.s3key = Some(s3key.clone());
    document.status = DOCUMENT_STATUS_STORAGE_UPLOAD.to_string();
    document.status_info = None;
    document.updated_at = chrono::Utc::now().naive_utc();
    let _ = diesel::update(documents::table.filter(documents::id.eq(&document.id)))
        .set((
            documents::s3key.eq(&s3key),
            documents::status.eq(&document.status),
            documents::status_info.eq(None::<String>),
            documents::updated_at.eq(document.updated_at),
        ))
        .execute(conn);
    get_global_pubsub().publish_document_status(GqlDocumentStatusMessage::from_document(document));

    enqueue_parse(document, conn, sqs, config).await;
    Ok(())
}

/// Send the `parse_document` command; failures surface as the document's
/// `error` status (a later re-upload of the same file re-kicks it).
async fn enqueue_parse(
    document: &mut Document,
    conn: &mut crate::database::DbConnection,
    sqs: Option<&SqsService>,
    config: &AppConfig,
) {
    let Some(s3key) = document.s3key.clone().filter(|k| !k.is_empty()) else {
        return;
    };
    let Some(sqs) = sqs else {
        warn!("SQS documents queue not configured — document will stay unparsed");
        set_document_error(document, conn, "SQS documents queue not configured");
        return;
    };
    match sqs
        .send_parse_document(config, &document.id, &s3key, document.mime.as_deref())
        .await
    {
        Ok(()) => info!(
            "Queued parse_document for {} ({})",
            document.id, document.file_name
        ),
        Err(e) => {
            warn!(
                "Failed to enqueue parse_document for {}: {}",
                document.id, e
            );
            set_document_error(document, conn, &format!("Failed to queue parsing: {}", e));
        }
    }
}

fn set_document_error(
    document: &mut Document,
    conn: &mut crate::database::DbConnection,
    info: &str,
) {
    document.status = DOCUMENT_STATUS_ERROR.to_string();
    document.status_info = Some(info.to_string());
    document.updated_at = chrono::Utc::now().naive_utc();
    let _ = diesel::update(documents::table.filter(documents::id.eq(&document.id)))
        .set((
            documents::status.eq(&document.status),
            documents::status_info.eq(&document.status_info),
            documents::updated_at.eq(document.updated_at),
        ))
        .execute(conn);
    get_global_pubsub().publish_document_status(GqlDocumentStatusMessage::from_document(document));
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
