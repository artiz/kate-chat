//! Wire formats shared with the rest of KateChat.
//!
//! These types reproduce the JSON contracts the previous Python service spoke:
//! the SQS command envelope, the Redis `document:status` notification, and the
//! `*.chunked.json` artifact consumed by the API indexer
//! (`api/src/services/document-queue.service.ts`).

use serde::{Deserialize, Serialize};

/// Incoming SQS command (`parse_document` / `split_document`).
///
/// `parentS3Key` / `part` / `partsCount` are set when a large PDF is processed as
/// page-batched parts (see [`PartCommand`]).
#[derive(Debug, Clone, Deserialize)]
pub struct Command {
    pub command: Option<String>,
    #[serde(rename = "documentId")]
    pub document_id: Option<String>,
    #[serde(rename = "s3key")]
    pub s3_key: Option<String>,
    #[serde(default)]
    pub mime: Option<String>,
    #[serde(default, rename = "parentS3Key")]
    pub parent_s3_key: Option<String>,
    #[serde(default)]
    pub part: Option<i64>,
    #[serde(default, rename = "partsCount")]
    pub parts_count: Option<i64>,
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

/// Outgoing `parse_document` command for one page-batched part of a large PDF.
#[derive(Debug, Serialize)]
pub struct PartCommand<'a> {
    pub command: &'a str,
    #[serde(rename = "documentId")]
    pub document_id: &'a str,
    #[serde(rename = "s3key")]
    pub s3_key: &'a str,
    pub mime: &'a str,
    #[serde(rename = "parentS3Key")]
    pub parent_s3_key: &'a str,
    pub part: u32,
    #[serde(rename = "partsCount")]
    pub parts_count: u32,
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

/// One parsed page (Markdown) in the internal `*.parsed.json` intermediate.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedPage {
    pub page: u32,
    /// Markdown for this page.
    pub text: String,
}

/// The internal `*.parsed.json` artifact (parse → split handoff). Not consumed by
/// the API or client; only this service reads it back during the split stage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedDocument {
    pub pages_count: u32,
    pub pages: Vec<ParsedPage>,
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
