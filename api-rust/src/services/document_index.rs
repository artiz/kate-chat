//! RAG document indexing: polls the SQS index queue for `index_document`
//! commands emitted by the document-processor, generates embeddings for
//! the parsed chunks and a summary of the parsed markdown, and drives the
//! document through embedding → summarizing → ready. Mirrors the Node
//! API's DocumentSqsService + DocumentQueueService.

use diesel::prelude::*;
use serde::Deserialize;
use serde_json::Value;
use tracing::{error, info, warn};

use crate::config::AppConfig;
use crate::database::{DbConnection, DbPool};
use crate::models::document::{Document, DocumentChunk, GqlDocumentStatusMessage};
use crate::models::{Model, User};
use crate::schema::{document_chunks, documents, models, users};
use crate::services::ai::{
    AIProviderService, AIService, InvokeModelRequest, MessageRole, ModelMessage,
};
use crate::services::pubsub::get_global_pubsub;
use crate::services::s3::S3Service;
use crate::utils::errors::AppError;

const SUMMARIZING_OUTPUT_TOKENS: i32 = 2000;
const SUMMARIZING_TEMPERATURE: f32 = 0.25;
const DEFAULT_MODEL_MAX_INPUT_TOKENS: i32 = 8192;
const CHARACTERS_PER_TOKEN: f32 = 3.5;

fn summary_prompt(content: &str) -> String {
    format!(
        "Please provide a comprehensive summary of the following document in up to 1024 words. \n\
    Return only summary, without any additional commentaries.\n\
    Focus on the main topics, key findings, and important details:\n\n{}",
        content
    )
}

/// One chunk of the processor's `*.chunked.json`.
#[derive(Debug, Deserialize)]
struct ParsedChunk {
    page: i32,
    /// index of the chunk within its page
    id: i64,
    text: String,
}

#[derive(Debug, Deserialize)]
struct ChunkedDocument {
    #[serde(default)]
    chunks: Vec<ParsedChunk>,
}

/// Poll the index queue forever. Spawned at startup when RAG is
/// configured.
pub async fn start_index_consumer(config: AppConfig, db_pool: DbPool) {
    let Some(queue_url) = config.sqs_index_documents_queue.clone() else {
        return;
    };
    let sqs = match crate::services::sqs::SqsService::new(&config).await {
        Ok(sqs) => sqs,
        Err(e) => {
            error!("Failed to initialize SQS for index consumer: {}", e);
            return;
        }
    };
    info!("Document index consumer polling {}", queue_url);

    loop {
        let received = sqs.receive_messages(&queue_url, 10, 5).await;
        let messages = match received {
            Ok(messages) => messages,
            Err(e) => {
                warn!("Index queue receive failed: {}", e);
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                continue;
            }
        };

        for (body, receipt) in messages {
            let done = handle_message(&config, &db_pool, &body).await;
            if done {
                if let Err(e) = sqs.delete_message(&queue_url, &receipt).await {
                    warn!("Failed to delete index queue message: {}", e);
                }
            }
        }
    }
}

/// Returns true when the message is handled (or permanently unusable) and
/// should be deleted from the queue.
async fn handle_message(config: &AppConfig, db_pool: &DbPool, body: &str) -> bool {
    let Ok(payload) = serde_json::from_str::<Value>(body) else {
        warn!("Ignoring non-JSON index queue message");
        return true;
    };
    let command = payload.get("command").and_then(|c| c.as_str());
    if command != Some("index_document") {
        // Status notifications and other commands are not handled here
        return true;
    }
    let (Some(document_id), Some(s3key)) = (
        payload.get("documentId").and_then(|d| d.as_str()),
        payload.get("s3key").and_then(|s| s.as_str()),
    ) else {
        warn!("index_document without documentId/s3key");
        return true;
    };

    info!("Processing index_document for {}", document_id);
    match index_document(config, db_pool, document_id, s3key).await {
        Ok(()) => true,
        Err(e) => {
            error!("Failed to index document {}: {}", document_id, e);
            if let Ok(mut conn) = db_pool.get() {
                let _ = diesel::update(documents::table.filter(documents::id.eq(document_id)))
                    .set((
                        documents::status.eq("error"),
                        documents::status_info.eq(e.to_string()),
                        documents::updated_at.eq(chrono::Utc::now().naive_utc()),
                    ))
                    .execute(&mut conn);
                publish_status(&mut conn, document_id);
            }
            true
        }
    }
}

fn publish_status(conn: &mut DbConnection, document_id: &str) {
    if let Ok(doc) = documents::table
        .filter(documents::id.eq(document_id))
        .first::<Document>(conn)
    {
        get_global_pubsub().publish_document_status(GqlDocumentStatusMessage::from_document(&doc));
    }
}

fn set_document_status(
    conn: &mut DbConnection,
    document_id: &str,
    status: &str,
    progress: f32,
) -> Result<(), AppError> {
    diesel::update(documents::table.filter(documents::id.eq(document_id)))
        .set((
            documents::status.eq(status),
            documents::status_progress.eq(progress),
            documents::status_info.eq(None::<String>),
            documents::updated_at.eq(chrono::Utc::now().naive_utc()),
        ))
        .execute(conn)
        .map_err(|e| AppError::Database(e.to_string()))?;
    publish_status(conn, document_id);
    Ok(())
}

async fn index_document(
    config: &AppConfig,
    db_pool: &DbPool,
    document_id: &str,
    s3key: &str,
) -> Result<(), AppError> {
    let mut conn = db_pool
        .get()
        .map_err(|e| AppError::Database(e.to_string()))?;

    let document: Document = documents::table
        .filter(documents::id.eq(document_id))
        .first(&mut conn)
        .map_err(|_| AppError::NotFound(format!("Document {} not found", document_id)))?;
    let owner: User = users::table
        .filter(users::id.eq(&document.owner_id))
        .first(&mut conn)
        .map_err(|_| AppError::NotFound("Document owner not found".to_string()))?;

    let effective_config = config.with_user_settings(owner.settings.as_ref());
    let ai_service = AIService::new(effective_config.clone());
    let mut s3 = S3Service::new(effective_config.clone());

    let embeddings_model_id = document.embeddings_model_id.clone().or_else(|| {
        owner
            .settings
            .as_ref()
            .and_then(|s| s.documents_embeddings_model_id.clone())
    });
    let summary_model_id = document.summary_model_id.clone().or_else(|| {
        owner
            .settings
            .as_ref()
            .and_then(|s| s.document_summarization_model_id.clone())
    });

    diesel::update(documents::table.filter(documents::id.eq(document_id)))
        .set((
            documents::embeddings_model_id.eq(&embeddings_model_id),
            documents::summary_model_id.eq(&summary_model_id),
        ))
        .execute(&mut conn)
        .map_err(|e| AppError::Database(e.to_string()))?;

    // ---- Embeddings ----
    if let Some(model_id) = &embeddings_model_id {
        let model: Option<Model> = models::table
            .filter(models::model_id.eq(model_id))
            .filter(models::user_id.eq(&owner.id))
            .first(&mut conn)
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;

        match model {
            None => warn!(
                "Embeddings model {} not found, skipping embeddings",
                model_id
            ),
            Some(model) => {
                let (chunked, _) = s3.get_file(&format!("{}.chunked.json", s3key)).await?;
                let chunked: ChunkedDocument = serde_json::from_slice(&chunked).map_err(|e| {
                    AppError::Internal(format!("Invalid chunked JSON for {}: {}", document_id, e))
                })?;

                let provider = ai_service.get_provider_for_model(&model)?;
                let total = chunked.chunks.len().max(1);
                info!(
                    "Embedding {} chunks of document {} with {}",
                    chunked.chunks.len(),
                    document_id,
                    model.model_id
                );
                set_document_status(&mut conn, document_id, "embedding", 0.0)?;

                for (i, chunk) in chunked.chunks.iter().enumerate() {
                    let existing: Option<DocumentChunk> = document_chunks::table
                        .filter(document_chunks::document_id.eq(document_id))
                        .filter(document_chunks::page.eq(chunk.page))
                        .filter(document_chunks::page_index.eq(chunk.id))
                        .first(&mut conn)
                        .optional()
                        .map_err(|e| AppError::Database(e.to_string()))?;

                    let up_to_date = existing
                        .as_ref()
                        .is_some_and(|c| c.model_id == model.model_id && c.embedding.is_some());
                    if !up_to_date {
                        let embedding = provider
                            .get_embeddings(&model.model_id, &chunk.text)
                            .await?;
                        let embedding_json = serde_json::to_string(&embedding)
                            .map_err(|e| AppError::Internal(e.to_string()))?;

                        if let Some(existing) = existing {
                            diesel::update(
                                document_chunks::table.filter(document_chunks::id.eq(&existing.id)),
                            )
                            .set((
                                document_chunks::model_id.eq(&model.model_id),
                                document_chunks::content.eq(&chunk.text),
                                document_chunks::embedding.eq(&embedding_json),
                            ))
                            .execute(&mut conn)
                            .map_err(|e| AppError::Database(e.to_string()))?;
                        } else {
                            diesel::insert_into(document_chunks::table)
                                .values(DocumentChunk {
                                    id: uuid::Uuid::new_v4().to_string(),
                                    document_id: document_id.to_string(),
                                    model_id: model.model_id.clone(),
                                    page: chunk.page,
                                    page_index: chunk.id,
                                    content: chunk.text.clone(),
                                    embedding: Some(embedding_json),
                                })
                                .execute(&mut conn)
                                .map_err(|e| AppError::Database(e.to_string()))?;
                        }
                    }

                    set_document_status(
                        &mut conn,
                        document_id,
                        "embedding",
                        (i + 1) as f32 / total as f32,
                    )?;
                }
            }
        }
    } else {
        warn!(
            "No embeddings model configured for document {}, skipping embeddings",
            document_id
        );
    }

    // ---- Summary ----
    if let Some(model_id) = &summary_model_id {
        let model: Option<Model> = models::table
            .filter(models::model_id.eq(model_id))
            .filter(models::user_id.eq(&owner.id))
            .first(&mut conn)
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;

        match model {
            None => warn!("Summary model {} not found, skipping summary", model_id),
            Some(model) => {
                set_document_status(&mut conn, document_id, "summarizing", 0.5)?;

                let (markdown, _) = s3.get_file(&format!("{}.parsed.md", s3key)).await?;
                let markdown = String::from_utf8_lossy(&markdown).to_string();

                // "begin ... end" strategy when the document exceeds the
                // model's input window
                let max_len = ((model
                    .max_input_tokens
                    .unwrap_or(DEFAULT_MODEL_MAX_INPUT_TOKENS))
                    as f32
                    * CHARACTERS_PER_TOKEN) as usize;
                let content = if markdown.chars().count() > max_len {
                    let half = max_len / 2;
                    let chars: Vec<char> = markdown.chars().collect();
                    let begin: String = chars[..half].iter().collect();
                    let end: String = chars[chars.len() - half..].iter().collect();
                    format!("{}...{}", begin, end)
                } else {
                    markdown
                };

                let provider = ai_service.get_provider_for_model(&model)?;
                let response = provider
                    .invoke_model(InvokeModelRequest {
                        model_id: model.model_id.clone(),
                        messages: vec![ModelMessage::text(
                            MessageRole::User,
                            summary_prompt(&content),
                        )],
                        temperature: Some(SUMMARIZING_TEMPERATURE),
                        max_tokens: Some(SUMMARIZING_OUTPUT_TOKENS),
                        top_p: None,
                        system_prompt: None,
                        tools: None,
                    })
                    .await?;

                diesel::update(documents::table.filter(documents::id.eq(document_id)))
                    .set(documents::summary.eq(&response.content))
                    .execute(&mut conn)
                    .map_err(|e| AppError::Database(e.to_string()))?;
                info!(
                    "Generated summary for document {} ({} characters)",
                    document_id,
                    response.content.len()
                );
            }
        }
    } else {
        warn!(
            "No summarization model configured for document {}, skipping summary",
            document_id
        );
    }

    set_document_status(&mut conn, document_id, "ready", 1.0)?;
    info!("Successfully indexed document {}", document_id);
    Ok(())
}
