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
use std::time::Duration;

use anyhow::{Context, Result};

use crate::config::Config;
use crate::model::{ChunkedDocument, Command, OutCommand, PageText, ParsedDocument, PartCommand};
use crate::parser::ParseOutput;
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
            "parse_document" => {
                let parts_count = cmd.parts_count.unwrap_or(1);
                if parts_count > 1 {
                    // One page-batched part of a larger PDF.
                    let part = cmd.part.unwrap_or(-1);
                    let parent = cmd.parent_s3_key.clone().unwrap_or_default();
                    if part < 0 || parent.is_empty() {
                        tracing::warn!(?cmd, "invalid part command");
                        return Ok(());
                    }
                    self.parse_document_part(
                        &document_id,
                        &s3_key,
                        cmd.mime,
                        &parent,
                        part as u32,
                        parts_count as u32,
                    )
                    .await
                } else {
                    // Distributed lock so duplicate messages for the same document
                    // aren't parsed by multiple workers concurrently.
                    let lock_key = format!("{s3_key}.processing");
                    if !self
                        .status
                        .try_acquire(&lock_key, self.cfg.parse_timeout_seconds + 120)
                        .await
                    {
                        tracing::info!(
                            document_id,
                            "document already being processed by another worker; skipping duplicate"
                        );
                        return Ok(());
                    }
                    let result = self.parse_document(&document_id, &s3_key, cmd.mime).await;
                    self.status.release(&lock_key).await;
                    result
                }
            }
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
        tracing::info!(document_id, "checking for existing parse output");
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
        tracing::info!(document_id, "downloading document from S3");
        let (bytes, content_type) = self
            .s3
            .get_object(s3_key)
            .await
            .with_context(|| format!("download {s3_key}"))?;
        tracing::info!(document_id, bytes = bytes.len(), content_type = ?content_type, "downloaded document");

        let mime = mime.or(content_type);

        // Large PDFs are split into page batches processed in parallel across workers.
        let is_pdf =
            crate::parser::is_pdf(s3_key, mime.as_deref()) || crate::parser::looks_like_pdf(&bytes);
        if self.cfg.pdf_page_batch_size > 0
            && is_pdf
            && self
                .maybe_batch_pdf(document_id, s3_key, mime.as_deref(), &bytes)
                .await?
        {
            // Batched: parts were enqueued; this message is done.
            return Ok(());
        }

        self.status
            .set_progress(ProgressArgs::new(&parsing_key, document_id, "parsing", 0.3))
            .await;

        let name = file_stem(s3_key);
        let output = match self.run_parse(name, mime, bytes).await {
            Ok(output) => output,
            Err(msg) => {
                tracing::error!(document_id, error = %msg, "failed to parse document");
                self.report_error(&parsing_key, document_id, &msg).await;
                return Ok(());
            }
        };

        // Internal page intermediate (parse → split handoff) + Markdown for summaries.
        let parsed = ParsedDocument {
            pages_count: output.pages_count,
            pages: output.pages,
        };
        let parsed_json = serde_json::to_vec_pretty(&parsed).context("serialize parsed.json")?;
        let markdown = parsed
            .pages
            .iter()
            .map(|p| p.text.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");

        self.status
            .set_progress(ProgressArgs::new(&parsing_key, document_id, "parsing", 0.6))
            .await;
        self.s3
            .put_object(&parsed_json_key, parsed_json, "application/json")
            .await?;

        self.status
            .set_progress(ProgressArgs::new(&parsing_key, document_id, "parsing", 0.8))
            .await;
        self.s3
            .put_object(&parsed_md_key, markdown.into_bytes(), "text/markdown")
            .await?;

        self.status
            .set_progress(
                ProgressArgs::new(&parsing_key, document_id, "parsing", 1.0)
                    .pages_count(parsed.pages_count)
                    .end_time(now_ns()),
            )
            .await;

        self.send_split(document_id, s3_key).await?;
        tracing::info!(document_id, "successfully parsed document");
        Ok(())
    }

    async fn split_document(&self, document_id: &str, s3_key: &str) -> Result<()> {
        let chunking_key = format!("{s3_key}.chunking");
        let parsed_json_key = format!("{s3_key}.parsed.json");
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

        let parsed_json = self
            .s3
            .get_object_text(&parsed_json_key)
            .await
            .with_context(|| format!("download {parsed_json_key}"))?;
        let parsed: ParsedDocument = match serde_json::from_str(&parsed_json) {
            Ok(parsed) => parsed,
            Err(err) => {
                // Malformed/stale intermediate is a poison message, not a transient
                // failure: report and ack rather than redeliver forever.
                let msg = format!("invalid {parsed_json_key}: {err}");
                tracing::error!(document_id, error = %msg, "cannot read parsed intermediate");
                self.report_error(&chunking_key, document_id, &msg).await;
                return Ok(());
            }
        };
        let pages_count = parsed.pages_count;

        self.status
            .set_progress(
                ProgressArgs::new(&chunking_key, document_id, "chunking", 0.3)
                    .pages_count(pages_count),
            )
            .await;

        let target = self.cfg.chunk_size_tokens;
        let chunk_result =
            tokio::task::spawn_blocking(move || chunk_document(parsed, target)).await;

        let document = match chunk_result {
            Ok(document) => document,
            Err(join_err) => {
                let msg = format!("chunker task crashed: {join_err}");
                tracing::error!(document_id, error = %msg, "chunker panicked");
                self.report_error(&chunking_key, document_id, &msg).await;
                return Ok(());
            }
        };

        self.status
            .set_progress(
                ProgressArgs::new(&chunking_key, document_id, "chunking", 0.6)
                    .pages_count(pages_count),
            )
            .await;

        let json = serde_json::to_vec_pretty(&document).context("serialize chunked.json")?;

        self.status
            .set_progress(
                ProgressArgs::new(&chunking_key, document_id, "chunking", 0.8)
                    .pages_count(pages_count),
            )
            .await;
        self.s3
            .put_object(&chunked_json_key, json, "application/json")
            .await?;

        self.status
            .set_progress(
                ProgressArgs::new(&chunking_key, document_id, "chunking", 1.0)
                    .pages_count(pages_count)
                    .end_time(now_ns()),
            )
            .await;

        self.send_index(document_id, s3_key).await?;
        tracing::info!(
            document_id,
            pages = pages_count,
            "successfully chunked document"
        );
        Ok(())
    }

    /// Run a (blocking) parse on a worker thread with a hard timeout, so a slow or
    /// hung conversion fails the document instead of freezing the worker forever.
    async fn run_parse(
        &self,
        name: String,
        mime: Option<String>,
        bytes: Vec<u8>,
    ) -> Result<ParseOutput, String> {
        let timeout = Duration::from_secs(self.cfg.parse_timeout_seconds);
        let handle = tokio::task::spawn_blocking(move || {
            crate::parser::parse(&name, mime.as_deref(), bytes)
        });
        match tokio::time::timeout(timeout, handle).await {
            Ok(Ok(Ok(output))) => Ok(output),
            Ok(Ok(Err(parse_err))) => Err(parse_err),
            Ok(Err(join_err)) => Err(format!("parser task crashed: {join_err}")),
            Err(_) => Err(format!(
                "parse timed out after {}s",
                self.cfg.parse_timeout_seconds
            )),
        }
    }

    /// Split a large PDF into page batches, upload each as a part, and enqueue a
    /// `parse_document` command per part. Returns `true` if the document was
    /// batched (the caller should then ack without parsing it whole).
    async fn maybe_batch_pdf(
        &self,
        document_id: &str,
        s3_key: &str,
        mime: Option<&str>,
        bytes: &[u8],
    ) -> Result<bool> {
        let batch_size = self.cfg.pdf_page_batch_size;

        // Counting pages and splitting (pdfium) are blocking; keep them off the
        // async runtime and time-bound them.
        let bytes_owned = bytes.to_vec();
        let split =
            tokio::task::spawn_blocking(move || -> Result<(usize, Vec<Vec<u8>>), String> {
                let page_count = crate::pdf::page_count(&bytes_owned)?;
                if page_count <= batch_size {
                    return Ok((page_count, Vec::new()));
                }
                let parts = crate::pdf::split_into_parts(&bytes_owned, batch_size)?;
                Ok((page_count, parts))
            });
        let analysis =
            match tokio::time::timeout(Duration::from_secs(self.cfg.parse_timeout_seconds), split)
                .await
            {
                Ok(joined) => joined,
                Err(_) => {
                    tracing::error!(document_id, "pdf inspect/split timed out");
                    return Ok(false);
                }
            };

        let (page_count, parts) = match analysis {
            Ok(Ok(result)) => result,
            Ok(Err(e)) => {
                tracing::error!(document_id, error = %e, "pdf inspect/split failed");
                return Ok(false);
            }
            Err(join_err) => {
                tracing::error!(document_id, error = %join_err, "pdf split task crashed");
                return Ok(false);
            }
        };
        tracing::info!(
            document_id,
            pages = page_count,
            "inspected PDF for batching"
        );

        // Not over the threshold, or could not split → parse as a single document.
        if parts.len() <= 1 {
            return Ok(false);
        }
        let parts_count = parts.len() as u32;
        let parsing_key = format!("{s3_key}.parsing");
        let mime = mime.unwrap_or("application/pdf").to_string();

        tracing::info!(
            document_id,
            pages = page_count,
            parts = parts_count,
            "batching large PDF"
        );
        self.status
            .set_progress(
                ProgressArgs::new(&parsing_key, document_id, "batching", 0.0).start_time(now_ns()),
            )
            .await;

        for (index, part_bytes) in parts.into_iter().enumerate() {
            let part_key = format!("{s3_key}.part{index}");
            self.s3
                .put_object(&part_key, part_bytes, "application/pdf")
                .await?;
            self.send_parse_part(
                document_id,
                &part_key,
                &mime,
                s3_key,
                index as u32,
                parts_count,
            )
            .await?;

            let progress = (index as f64 + 1.0) / parts_count as f64;
            self.status
                .set_progress(
                    ProgressArgs::new(&parsing_key, document_id, "batching", progress.min(0.99))
                        .pages_count(page_count as u32),
                )
                .await;
        }

        self.status
            .set_progress(
                ProgressArgs::new(&parsing_key, document_id, "batching", 1.0)
                    .pages_count(page_count as u32)
                    .end_time(now_ns()),
            )
            .await;
        Ok(true)
    }

    /// Parse one page-batched part of a PDF, write its (globally-numbered) pages,
    /// and try to finalize the parent document.
    async fn parse_document_part(
        &self,
        document_id: &str,
        part_s3_key: &str,
        mime: Option<String>,
        parent_s3_key: &str,
        part: u32,
        parts_count: u32,
    ) -> Result<()> {
        let parsing_key = format!("{parent_s3_key}.parsing");
        let parent_parsed_key = format!("{parent_s3_key}.parsed.json");
        let part_parsed_key = format!("{part_s3_key}.parsed.json");

        // Parent already assembled → just (re)trigger split.
        if self.s3.exists(&parent_parsed_key).await? {
            self.send_split(document_id, parent_s3_key).await?;
            return Ok(());
        }

        // Parse this part unless it was already parsed (idempotent redelivery).
        if !self.s3.exists(&part_parsed_key).await? {
            let (bytes, content_type) = self
                .s3
                .get_object(part_s3_key)
                .await
                .with_context(|| format!("download {part_s3_key}"))?;
            let mime = mime.or(content_type);
            let name = file_stem(parent_s3_key);

            let output = match self.run_parse(name, mime, bytes).await {
                Ok(output) => output,
                Err(msg) => {
                    tracing::error!(document_id, part, error = %msg, "failed to parse part");
                    self.report_error(&parsing_key, document_id, &msg).await;
                    return Ok(());
                }
            };

            // Offset local page numbers (1..k) to global numbers for this part.
            let offset = part * self.cfg.pdf_page_batch_size as u32;
            let pages: Vec<_> = output
                .pages
                .into_iter()
                .map(|mut p| {
                    p.page += offset;
                    p
                })
                .collect();
            let part_doc = ParsedDocument {
                pages_count: pages.len() as u32,
                pages,
            };
            let json =
                serde_json::to_vec_pretty(&part_doc).context("serialize part parsed.json")?;
            self.s3
                .put_object(&part_parsed_key, json, "application/json")
                .await?;
            // The part PDF is no longer needed.
            let _ = self.s3.delete(part_s3_key).await;
        }

        self.finalize_partitioned(document_id, parent_s3_key, parts_count)
            .await
    }

    /// Combine all parsed parts into the parent document once every part is done.
    async fn finalize_partitioned(
        &self,
        document_id: &str,
        parent_s3_key: &str,
        parts_count: u32,
    ) -> Result<()> {
        let parsing_key = format!("{parent_s3_key}.parsing");
        let parent_parsed_key = format!("{parent_s3_key}.parsed.json");
        let parent_md_key = format!("{parent_s3_key}.parsed.md");

        if self.s3.exists(&parent_parsed_key).await? {
            self.send_split(document_id, parent_s3_key).await?;
            return Ok(());
        }

        // How many parts are done?
        let mut completed = 0u32;
        for i in 0..parts_count {
            if self
                .s3
                .exists(&format!("{parent_s3_key}.part{i}.parsed.json"))
                .await?
            {
                completed += 1;
            }
        }

        if completed < parts_count {
            let progress = completed as f64 / parts_count as f64;
            self.status
                .set_progress(
                    ProgressArgs::new(&parsing_key, document_id, "parsing", progress)
                        .info(&format!("parsed {completed}/{parts_count} parts")),
                )
                .await;
            return Ok(());
        }

        // All parts present → combine, in page order.
        let mut pages = Vec::new();
        for i in 0..parts_count {
            let key = format!("{parent_s3_key}.part{i}.parsed.json");
            let text = self
                .s3
                .get_object_text(&key)
                .await
                .with_context(|| format!("download {key}"))?;
            let doc: ParsedDocument =
                serde_json::from_str(&text).with_context(|| format!("parse {key}"))?;
            pages.extend(doc.pages);
        }
        pages.sort_by_key(|p| p.page);
        let pages_count = pages.len() as u32;

        let markdown = pages
            .iter()
            .map(|p| p.text.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        let combined = ParsedDocument { pages_count, pages };
        let json = serde_json::to_vec_pretty(&combined).context("serialize parsed.json")?;
        self.s3
            .put_object(&parent_parsed_key, json, "application/json")
            .await?;
        self.s3
            .put_object(&parent_md_key, markdown.into_bytes(), "text/markdown")
            .await?;

        // Best-effort cleanup of part artifacts.
        for i in 0..parts_count {
            let _ = self
                .s3
                .delete(&format!("{parent_s3_key}.part{i}.parsed.json"))
                .await;
            let _ = self.s3.delete(&format!("{parent_s3_key}.part{i}")).await;
        }

        self.status
            .set_progress(
                ProgressArgs::new(&parsing_key, document_id, "parsing", 1.0)
                    .pages_count(pages_count)
                    .end_time(now_ns()),
            )
            .await;
        self.send_split(document_id, parent_s3_key).await?;
        tracing::info!(
            document_id,
            parts = parts_count,
            pages = pages_count,
            "assembled partitioned document"
        );
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

    async fn send_parse_part(
        &self,
        document_id: &str,
        part_s3_key: &str,
        mime: &str,
        parent_s3_key: &str,
        part: u32,
        parts_count: u32,
    ) -> Result<()> {
        self.send(
            &self.cfg.sqs_documents_queue,
            &PartCommand {
                command: "parse_document",
                document_id,
                s3_key: part_s3_key,
                mime,
                parent_s3_key,
                part,
                parts_count,
            },
        )
        .await
    }

    async fn send<T: serde::Serialize>(&self, queue_url: &str, cmd: &T) -> Result<()> {
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

/// Clean and chunk every page of a parsed document. Chunk `id`s reset per page
/// (matching the Python splitter); `page` carries the real page number.
fn chunk_document(parsed: ParsedDocument, target_tokens: usize) -> ChunkedDocument {
    let mut chunks = Vec::new();
    let mut pages = Vec::with_capacity(parsed.pages.len());
    for page in parsed.pages {
        let cleaned = crate::chunker::clean_text(&page.text);
        chunks.extend(crate::chunker::chunk_page(
            &cleaned,
            page.page,
            target_tokens,
        ));
        pages.push(PageText {
            page: page.page,
            text: cleaned,
        });
    }
    ChunkedDocument { chunks, pages }
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
