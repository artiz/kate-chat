//! Wire formats shared with the rest of KateChat.
//!
//! These types reproduce the JSON contracts the previous Python service spoke:
//! the SQS command envelope, the Redis `document:status` notification, and the
//! `*.chunked.json` artifact consumed by the API indexer
//! (`api/src/services/document-queue.service.ts`).

use serde::{Deserialize, Serialize};

/// Incoming SQS command (`parse_document` / `split_document`).
///
/// The `parentS3Key` / `part` / `partsCount` fields existed for the Python
/// PDF page-batching path; they are accepted for backward compatibility but the
/// Rust pipeline processes each document in a single pass (see README).
#[derive(Debug, Clone, Deserialize)]
pub struct Command {
    pub command: Option<String>,
    #[serde(rename = "documentId")]
    pub document_id: Option<String>,
    #[serde(rename = "s3key")]
    pub s3_key: Option<String>,
    #[serde(default)]
    pub mime: Option<String>,
}

/// Outgoing SQS command envelope (`split_document` / `index_document`).
#[derive(Debug, Serialize)]
pub struct OutCommand<'a> {
    pub command: &'a str,
    #[serde(rename = "documentId")]
    pub document_id: &'a str,
    #[serde(rename = "s3key")]
    pub s3_key: &'a str,
}

/// Redis pub/sub progress notification. Field names and shape match the Python
/// service exactly; the API relays this object verbatim to clients.
#[derive(Debug, Default, Serialize)]
pub struct StatusNotification {
    #[serde(rename = "documentId")]
    pub document_id: String,
    pub status: String,
    #[serde(rename = "statusProgress")]
    pub status_progress: f64,
    #[serde(rename = "statusInfo")]
    pub status_info: Option<String>,
    pub progress: f64,
    #[serde(rename = "startTime")]
    pub start_time: Option<u64>,
    #[serde(rename = "endTime")]
    pub end_time: Option<u64>,
    #[serde(rename = "currentTime")]
    pub current_time: u64,
    #[serde(rename = "pagesCount")]
    pub pages_count: Option<u32>,
    pub sync: bool,
}

/// One RAG chunk in `*.chunked.json`.
#[derive(Debug, Serialize)]
pub struct Chunk {
    pub page: u32,
    pub length_tokens: usize,
    pub text: String,
    /// Index of the chunk within its page.
    pub id: usize,
    /// "content" or "serialized_table".
    #[serde(rename = "type")]
    pub kind: String,
}

/// One page's cleaned text in `*.chunked.json`.
#[derive(Debug, Serialize)]
pub struct PageText {
    pub page: u32,
    pub text: String,
}

/// The `*.chunked.json` document consumed by the API indexer.
#[derive(Debug, Serialize)]
pub struct ChunkedDocument {
    pub chunks: Vec<Chunk>,
    pub pages: Vec<PageText>,
}
