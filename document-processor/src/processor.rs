//! The document processing pipeline: SQS command handling.
//!
//! Flow (mirrors the previous Python service's external contract):
//!   parse_document → write `*.parsed.json` + `*.parsed.md`, enqueue split_document
//!   split_document → write `*.chunked.json`, enqueue index_document (index queue)
//! Progress is reported on Redis throughout.
//!
//! Each `Ok(())` means the SQS message should be deleted (acked). An `Err`
//! signals a transient/infrastructure failure so the message is redelivered.
//! Document-level failures (bad file, parse error) are reported as `error`
//! status and return `Ok(())` to avoid poison-message redelivery loops.

use std::path::Path;
use std::sync::Arc;

use anyhow::{Context, Result};

use crate::config::Config;
use crate::model::{ChunkedDocument, Command, OutCommand, PageText};
use crate::redis_status::{now_ns, ProgressArgs, StatusPublisher};
use crate::s3::S3;

pub struct Processor {
    s3: S3,
    sqs: aws_sdk_sqs::Client,
    status: StatusPublisher,
    cfg: Arc<Config>,
}

impl Processor {
    pub fn new(
        s3: S3,
        sqs: aws_sdk_sqs::Client,
        status: StatusPublisher,
        cfg: Arc<Config>,
    ) -> Self {
        Self {
            s3,
            sqs,
            status,
            cfg,
        }
    }

    /// Dispatch one command. Returns `Ok(())` to ack the message.
    pub async fn handle_command(&self, cmd: Command) -> Result<()> {
        let command = cmd.command.clone().unwrap_or_default();
        let document_id = cmd.document_id.clone().unwrap_or_default();
        let s3_key = cmd.s3_key.clone().unwrap_or_default();

        if document_id.is_empty() || s3_key.is_empty() || command.is_empty() {
            tracing::warn!(
                ?cmd,
                "missing required command fields (command, documentId, s3key)"
            );
            return Ok(());
        }

        match command.as_str() {
            "parse_document" => self.parse_document(&document_id, &s3_key, cmd.mime).await,
            "split_document" => self.split_document(&document_id, &s3_key).await,
            other => {
                tracing::warn!(command = other, "unknown command type");
                Ok(())
            }
        }
    }

    async fn parse_document(
        &self,
        document_id: &str,
        s3_key: &str,
        mime: Option<String>,
    ) -> Result<()> {
        let parsing_key = format!("{s3_key}.parsing");
        let parsed_json_key = format!("{s3_key}.parsed.json");
        let parsed_md_key = format!("{s3_key}.parsed.md");

        // Idempotency: already parsed → just (re)trigger split.
        if self.s3.exists(&parsed_json_key).await? {
            tracing::info!(document_id, "already parsed, skipping to split");
            self.send_split(document_id, s3_key).await?;
            return Ok(());
        }

        let start = now_ns();
        self.status
            .set_progress(
                ProgressArgs::new(&parsing_key, document_id, "parsing", 0.0).start_time(start),
            )
            .await;

        // Infrastructure error → propagate (redeliver).
        let (bytes, content_type) = self
            .s3
            .get_object(s3_key)
            .await
            .with_context(|| format!("download {s3_key}"))?;

        let mime = mime.or(content_type);

        self.status
            .set_progress(ProgressArgs::new(&parsing_key, document_id, "parsing", 0.3))
            .await;

        let name = file_stem(s3_key);
        let parse_result = tokio::task::spawn_blocking(move || {
            crate::parser::parse(&name, mime.as_deref(), bytes)
        })
        .await;

        let output = match parse_result {
            Ok(Ok(output)) => output,
            Ok(Err(parse_err)) => {
                tracing::error!(document_id, error = %parse_err, "failed to parse document");
                self.report_error(&parsing_key, document_id, &parse_err)
                    .await;
                return Ok(());
            }
            Err(join_err) => {
                let msg = format!("parser task crashed: {join_err}");
                tracing::error!(document_id, error = %msg, "parser panicked");
                self.report_error(&parsing_key, document_id, &msg).await;
                return Ok(());
            }
        };

        self.status
            .set_progress(ProgressArgs::new(&parsing_key, document_id, "parsing", 0.6))
            .await;
        self.s3
            .put_object(
                &parsed_json_key,
                output.docling_json.into_bytes(),
                "application/json",
            )
            .await?;

        self.status
            .set_progress(ProgressArgs::new(&parsing_key, document_id, "parsing", 0.8))
            .await;
        self.s3
            .put_object(
                &parsed_md_key,
                output.markdown.into_bytes(),
                "text/markdown",
            )
            .await?;

        self.status
            .set_progress(
                ProgressArgs::new(&parsing_key, document_id, "parsing", 1.0).end_time(now_ns()),
            )
            .await;

        self.send_split(document_id, s3_key).await?;
        tracing::info!(document_id, "successfully parsed document");
        Ok(())
    }

    async fn split_document(&self, document_id: &str, s3_key: &str) -> Result<()> {
        let chunking_key = format!("{s3_key}.chunking");
        let parsed_md_key = format!("{s3_key}.parsed.md");
        let chunked_json_key = format!("{s3_key}.chunked.json");

        // Idempotency: already chunked → just (re)trigger index.
        if self.s3.exists(&chunked_json_key).await? {
            tracing::info!(document_id, "already chunked, skipping to index");
            self.send_index(document_id, s3_key).await?;
            return Ok(());
        }

        let start = now_ns();
        self.status
            .set_progress(
                ProgressArgs::new(&chunking_key, document_id, "chunking", 0.0).start_time(start),
            )
            .await;

        let markdown = self
            .s3
            .get_object_text(&parsed_md_key)
            .await
            .with_context(|| format!("download {parsed_md_key}"))?;

        self.status
            .set_progress(ProgressArgs::new(
                &chunking_key,
                document_id,
                "chunking",
                0.3,
            ))
            .await;

        let cleaned = crate::chunker::clean_text(&markdown);
        let target = self.cfg.chunk_size_tokens;
        let text_for_chunking = cleaned.clone();
        let chunk_result = tokio::task::spawn_blocking(move || {
            crate::chunker::chunk_page(&text_for_chunking, 1, target)
        })
        .await;

        let chunks = match chunk_result {
            Ok(chunks) => chunks,
            Err(join_err) => {
                let msg = format!("chunker task crashed: {join_err}");
                tracing::error!(document_id, error = %msg, "chunker panicked");
                self.report_error(&chunking_key, document_id, &msg).await;
                return Ok(());
            }
        };

        self.status
            .set_progress(ProgressArgs::new(
                &chunking_key,
                document_id,
                "chunking",
                0.6,
            ))
            .await;

        let document = ChunkedDocument {
            chunks,
            pages: vec![PageText {
                page: 1,
                text: cleaned,
            }],
        };
        let json = serde_json::to_vec_pretty(&document).context("serialize chunked.json")?;

        self.status
            .set_progress(ProgressArgs::new(
                &chunking_key,
                document_id,
                "chunking",
                0.8,
            ))
            .await;
        self.s3
            .put_object(&chunked_json_key, json, "application/json")
            .await?;

        self.status
            .set_progress(
                ProgressArgs::new(&chunking_key, document_id, "chunking", 1.0).end_time(now_ns()),
            )
            .await;

        self.send_index(document_id, s3_key).await?;
        tracing::info!(document_id, "successfully chunked document");
        Ok(())
    }

    async fn report_error(&self, key: &str, document_id: &str, info: &str) {
        self.status
            .set_progress(ProgressArgs::new(key, document_id, "error", 0.0).info(info))
            .await;
    }

    async fn send_split(&self, document_id: &str, s3_key: &str) -> Result<()> {
        self.send(
            &self.cfg.sqs_documents_queue,
            &OutCommand {
                command: "split_document",
                document_id,
                s3_key,
            },
        )
        .await
    }

    async fn send_index(&self, document_id: &str, s3_key: &str) -> Result<()> {
        self.send(
            &self.cfg.sqs_index_documents_queue,
            &OutCommand {
                command: "index_document",
                document_id,
                s3_key,
            },
        )
        .await
    }

    async fn send(&self, queue_url: &str, cmd: &OutCommand<'_>) -> Result<()> {
        let body = serde_json::to_string(cmd).context("serialize sqs command")?;
        self.sqs
            .send_message()
            .queue_url(queue_url)
            .message_body(body)
            .send()
            .await
            .with_context(|| format!("send_message to {queue_url}"))?;
        Ok(())
    }
}

/// Filename stem of an S3 key (drops the directory prefix and extension).
fn file_stem(s3_key: &str) -> String {
    Path::new(s3_key)
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("document")
        .to_string()
}
