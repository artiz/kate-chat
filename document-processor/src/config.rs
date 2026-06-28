//! Runtime configuration, loaded from environment variables.
//!
//! Mirrors the settings of the previous Python service (`app/core/config.py`)
//! so the same `.env` / container environment keeps working unchanged.

use std::env;

/// Service configuration resolved once at startup.
#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub version: String,
    pub commit_sha: String,
    pub environment: String,
    pub project_name: String,
    pub log_level: String,

    pub document_status_channel: String,
    pub redis_url: String,

    pub s3_endpoint: Option<String>,
    pub s3_region: String,
    pub s3_access_key_id: Option<String>,
    pub s3_secret_access_key: Option<String>,
    pub s3_files_bucket_name: String,

    pub sqs_endpoint: Option<String>,
    pub sqs_region: String,
    pub sqs_access_key_id: Option<String>,
    pub sqs_secret_access_key: Option<String>,
    pub sqs_documents_queue: String,
    pub sqs_index_documents_queue: String,

    /// Number of concurrent SQS poller workers.
    pub num_threads: usize,
    /// Target chunk size in tokens (o200k_base), matching the Python splitter.
    pub chunk_size_tokens: usize,
    /// SQS visibility timeout (seconds) requested per received message.
    pub visibility_timeout: i32,
    /// PDFs with more pages than this are split into parts of this many pages and
    /// processed in parallel across workers (0 disables batching).
    pub pdf_page_batch_size: usize,
    /// Hard cap on a single parse (seconds); on timeout the document is failed
    /// instead of hanging the worker forever.
    pub parse_timeout_seconds: u64,
}

#[derive(Debug, thiserror::Error)]
#[error("missing required environment variable: {0}")]
pub struct MissingEnv(&'static str);

fn opt(key: &str) -> Option<String> {
    match env::var(key) {
        Ok(v) if !v.trim().is_empty() => Some(v),
        _ => None,
    }
}

fn required(key: &'static str) -> Result<String, MissingEnv> {
    opt(key).ok_or(MissingEnv(key))
}

fn parse_or<T: std::str::FromStr>(key: &str, default: T) -> T {
    opt(key).and_then(|v| v.parse().ok()).unwrap_or(default)
}

/// Trim surrounding quotes that sometimes sneak in from `docker-compose`
/// `KEY="value"` style entries (the Python service quoted the channel name).
fn unquote(s: String) -> String {
    s.trim_matches('"').to_string()
}

impl Config {
    pub fn from_env() -> Result<Self, MissingEnv> {
        let num_threads = parse_or("NUM_THREADS", 4usize).clamp(1, 32);

        Ok(Self {
            port: parse_or("PORT", 8080u16),
            version: opt("VERSION").unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string()),
            commit_sha: opt("COMMIT_SHA").unwrap_or_else(|| "---".to_string()),
            environment: opt("ENVIRONMENT").unwrap_or_else(|| "development".to_string()),
            project_name: opt("PROJECT_NAME")
                .unwrap_or_else(|| "kate-chat-document-processor".to_string()),
            log_level: opt("LOG_LEVEL").unwrap_or_else(|| "INFO".to_string()),

            document_status_channel: unquote(
                opt("DOCUMENT_STATUS_CHANNEL").unwrap_or_else(|| "document:status".to_string()),
            ),
            redis_url: opt("REDIS_URL").unwrap_or_else(|| "redis://localhost:6379".to_string()),

            s3_endpoint: opt("S3_ENDPOINT"),
            s3_region: required("S3_REGION")?,
            s3_access_key_id: opt("S3_ACCESS_KEY_ID"),
            s3_secret_access_key: opt("S3_SECRET_ACCESS_KEY"),
            s3_files_bucket_name: opt("S3_FILES_BUCKET_NAME")
                .unwrap_or_else(|| "katechatdevfiles".to_string()),

            sqs_endpoint: opt("SQS_ENDPOINT"),
            sqs_region: required("SQS_REGION")?,
            sqs_access_key_id: opt("SQS_ACCESS_KEY_ID"),
            sqs_secret_access_key: opt("SQS_SECRET_ACCESS_KEY"),
            sqs_documents_queue: required("SQS_DOCUMENTS_QUEUE")?,
            sqs_index_documents_queue: required("SQS_INDEX_DOCUMENTS_QUEUE")?,

            num_threads,
            chunk_size_tokens: parse_or("CHUNK_SIZE_TOKENS", 300usize),
            visibility_timeout: parse_or("SQS_VISIBILITY_TIMEOUT", 300i32),
            pdf_page_batch_size: parse_or("PDF_PAGE_BATCH_SIZE", 10usize),
            parse_timeout_seconds: parse_or("PARSE_TIMEOUT_SECONDS", 1800u64),
        })
    }
}
