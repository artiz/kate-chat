//! RAG documents: uploaded files parsed/chunked by the external
//! document-processor (SQS pipeline), embedded and summarized by the API.
//! Mirrors the Node API's Document / DocumentChunk / ChatDocument entities.

use async_graphql::{InputObject, SimpleObject};
use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

pub const DOCUMENT_STATUS_UPLOAD: &str = "upload";
pub const DOCUMENT_STATUS_STORAGE_UPLOAD: &str = "storage_upload";
pub const DOCUMENT_STATUS_PARSING: &str = "parsing";
pub const DOCUMENT_STATUS_CHUNKING: &str = "chunking";
pub const DOCUMENT_STATUS_ERROR: &str = "error";

#[derive(Debug, Clone, Serialize, Deserialize, Queryable, Insertable)]
#[diesel(table_name = crate::schema::documents)]
pub struct Document {
    pub id: String,
    pub file_name: String,
    pub mime: Option<String>,
    pub file_size: i64,
    pub sha256checksum: String,
    pub s3key: Option<String>,
    pub owner_id: String,
    pub embeddings_model_id: Option<String>,
    pub summary_model_id: Option<String>,
    pub summary: Option<String>,
    pub pages_count: i32,
    pub status: String,
    pub status_info: Option<String>,
    pub status_progress: f32,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub metadata: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Queryable, Insertable)]
#[diesel(table_name = crate::schema::document_chunks)]
pub struct DocumentChunk {
    pub id: String,
    pub document_id: String,
    pub model_id: String,
    pub page: i32,
    pub page_index: i64,
    pub content: String,
    /// Embedding vector stored as a JSON array of floats (all backends).
    pub embedding: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Queryable, Insertable)]
#[diesel(table_name = crate::schema::chat_documents)]
pub struct ChatDocument {
    pub id: String,
    pub chat_id: String,
    pub document_id: String,
}

/// Processing timings recorded per stage (Node's DocumentMetadata);
/// timestamps are nanoseconds.
#[derive(Debug, Clone, Default, Serialize, Deserialize, SimpleObject)]
#[serde(rename_all = "camelCase", default)]
pub struct GqlDocumentMetadata {
    pub pages_count: Option<f64>,
    pub parsing_started_at: Option<f64>,
    pub parsing_ended_at: Option<f64>,
    pub parsing_page_per_second: Option<f64>,
    pub chunking_started_at: Option<f64>,
    pub chunking_ended_at: Option<f64>,
    pub chunking_page_per_second: Option<f64>,
    pub batching_started_at: Option<f64>,
    pub batching_ended_at: Option<f64>,
    pub batching_page_per_second: Option<f64>,
    pub embedding_started_at: Option<f64>,
    pub embedding_ended_at: Option<f64>,
    pub embedding_page_per_second: Option<f64>,
    pub summarization_started_at: Option<f64>,
    pub summarization_ended_at: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "Document")]
#[serde(rename_all = "camelCase")]
pub struct GqlDocument {
    pub id: String,
    pub file_name: String,
    pub mime: Option<String>,
    pub file_size: f64,
    pub sha256checksum: String,
    #[graphql(name = "s3key")]
    pub s3key: Option<String>,
    pub owner_id: String,
    pub embeddings_model_id: Option<String>,
    pub summary_model_id: Option<String>,
    pub summary: Option<String>,
    pub pages_count: i32,
    pub status: String,
    pub status_info: Option<String>,
    pub status_progress: Option<f32>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub metadata: Option<GqlDocumentMetadata>,
    pub download_url: Option<String>,
    pub download_url_markdown: Option<String>,
}

impl From<Document> for GqlDocument {
    fn from(doc: Document) -> Self {
        let download_url = doc
            .s3key
            .as_deref()
            .filter(|k| !k.is_empty())
            .map(|k| file_url(k, &doc.file_name));
        // The parsed markdown exists once parsing completed
        let download_url_markdown = doc
            .s3key
            .as_deref()
            .filter(|k| !k.is_empty())
            .filter(|_| {
                matches!(
                    doc.status.as_str(),
                    "ready" | "chunking" | "embedding" | "summarizing"
                )
            })
            .map(|k| {
                file_url(
                    &format!("{}.parsed.md", k),
                    &format!("{}.md", doc.file_name),
                )
            });
        let metadata = doc
            .metadata
            .as_deref()
            .and_then(|m| serde_json::from_str(m).ok());
        Self {
            id: doc.id,
            file_name: doc.file_name,
            mime: doc.mime,
            file_size: doc.file_size as f64,
            sha256checksum: doc.sha256checksum,
            s3key: doc.s3key,
            owner_id: doc.owner_id,
            embeddings_model_id: doc.embeddings_model_id,
            summary_model_id: doc.summary_model_id,
            summary: doc.summary,
            pages_count: doc.pages_count,
            status: doc.status,
            status_info: doc.status_info,
            status_progress: Some(doc.status_progress),
            created_at: doc.created_at,
            updated_at: doc.updated_at,
            metadata,
            download_url,
            download_url_markdown,
        }
    }
}

fn file_url(key: &str, name: &str) -> String {
    format!("/files/{}?name={}", key, urlencoding::encode(name))
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "DocumentsResponse")]
pub struct GqlDocumentsResponse {
    pub documents: Vec<GqlDocument>,
    pub total: i32,
    pub has_more: bool,
}

#[derive(Debug, Default, Serialize, Deserialize, InputObject)]
pub struct GetDocumentsInput {
    pub offset: Option<i32>,
    pub limit: Option<i32>,
    pub search_term: Option<String>,
}

/// addDocumentsToChat / removeDocumentsFromChat response.
#[derive(Debug, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "AddDocumentsToChatResponse")]
pub struct GqlChatDocumentsResponse {
    pub chat: Option<crate::models::GqlChat>,
    pub error: Option<String>,
}

/// documentsStatus subscription payload (Node's DocumentStatusMessage).
#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "DocumentStatusMessage")]
pub struct GqlDocumentStatusMessage {
    pub document_id: String,
    pub status: String,
    pub status_info: Option<String>,
    pub status_progress: Option<f32>,
    pub summary: Option<String>,
    pub updated_at: Option<NaiveDateTime>,
    pub pages_count: Option<i32>,
    pub metadata: Option<GqlDocumentMetadata>,
}

impl GqlDocumentStatusMessage {
    pub fn from_document(doc: &Document) -> Self {
        Self {
            document_id: doc.id.clone(),
            status: doc.status.clone(),
            status_info: doc.status_info.clone(),
            status_progress: Some(doc.status_progress),
            summary: doc.summary.clone(),
            updated_at: Some(doc.updated_at),
            pages_count: Some(doc.pages_count),
            metadata: doc
                .metadata
                .as_deref()
                .and_then(|m| serde_json::from_str(m).ok()),
        }
    }
}
