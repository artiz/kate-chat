//! Redis subscriber for the document-processor's live status stream.
//!
//! The processor publishes `StatusNotification` JSON on the
//! `document:status` channel (parsing/chunking progress with
//! nanosecond timings). Mirroring the Node API's SubscriptionsService +
//! documentsStatus resolver: accumulate per-document stage timings,
//! persist `sync` updates onto the document row and forward the status
//! into the in-process pubsub feeding the `documentsStatus` GraphQL
//! subscription.

use futures_util::StreamExt;
use std::collections::HashMap;
use tracing::{info, warn};

use diesel::prelude::*;

use crate::config::AppConfig;
use crate::database::DbPool;
use crate::models::document::{GqlDocumentMetadata, GqlDocumentStatusMessage};
use crate::schema::documents;
use crate::services::pubsub::get_global_pubsub;

/// Payload published by the document-processor (and the Python service).
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusNotification {
    document_id: String,
    status: String,
    #[serde(default)]
    status_progress: f64,
    status_info: Option<String>,
    start_time: Option<f64>,
    end_time: Option<f64>,
    #[serde(default)]
    current_time: f64,
    pages_count: Option<f64>,
    #[serde(default)]
    sync: bool,
}

/// Subscribe forever (with reconnect backoff). Spawned at startup when
/// REDIS_URL is configured.
pub async fn start_status_subscriber(config: AppConfig, db_pool: DbPool) {
    let Some(redis_url) = config.redis_url.clone() else {
        return;
    };
    let channel = config.document_status_channel.clone();
    let mut timings: HashMap<String, GqlDocumentMetadata> = HashMap::new();

    loop {
        match subscribe_loop(&redis_url, &channel, &db_pool, &mut timings).await {
            Ok(()) => return, // stream ended cleanly (shutdown)
            Err(e) => {
                warn!("Redis document-status subscriber error: {} — retrying", e);
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        }
    }
}

async fn subscribe_loop(
    redis_url: &str,
    channel: &str,
    db_pool: &DbPool,
    timings: &mut HashMap<String, GqlDocumentMetadata>,
) -> Result<(), String> {
    let client = redis::Client::open(redis_url).map_err(|e| e.to_string())?;
    let mut pubsub = client
        .get_async_connection()
        .await
        .map_err(|e| e.to_string())?
        .into_pubsub();
    pubsub.subscribe(channel).await.map_err(|e| e.to_string())?;
    info!("Subscribed to Redis document status channel '{}'", channel);

    let mut stream = pubsub.on_message();
    while let Some(msg) = stream.next().await {
        let Ok(payload) = msg.get_payload::<String>() else {
            continue;
        };
        let notification: StatusNotification = match serde_json::from_str(&payload) {
            Ok(n) => n,
            Err(e) => {
                warn!("Ignoring malformed document status payload: {}", e);
                continue;
            }
        };
        handle_notification(db_pool, timings, notification);
    }
    Ok(())
}

fn handle_notification(
    db_pool: &DbPool,
    timings: &mut HashMap<String, GqlDocumentMetadata>,
    payload: StatusNotification,
) {
    let metadata = timings.entry(payload.document_id.clone()).or_default();
    accumulate_timings(metadata, &payload);
    let metadata = metadata.clone();

    // Processor-originated updates are persisted (Node parity: sync=true)
    if payload.sync {
        if let Ok(mut conn) = db_pool.get() {
            let pages_count = metadata
                .pages_count
                .or(payload.pages_count)
                .map(|p| p as i32);
            let target = documents::table.filter(documents::id.eq(&payload.document_id));
            let base = (
                documents::status.eq(&payload.status),
                documents::status_info.eq(&payload.status_info),
                documents::status_progress.eq(payload.status_progress as f32),
                documents::metadata.eq(serde_json::to_string(&metadata).ok()),
                documents::updated_at.eq(chrono::Utc::now().naive_utc()),
            );
            let result = match pages_count {
                Some(pages) => diesel::update(target)
                    .set((base, documents::pages_count.eq(pages)))
                    .execute(&mut conn),
                None => diesel::update(target).set(base).execute(&mut conn),
            };
            if let Err(e) = result {
                warn!(
                    "Failed to persist document status for {}: {}",
                    payload.document_id, e
                );
            }
        }
    }

    get_global_pubsub().publish_document_status(GqlDocumentStatusMessage {
        document_id: payload.document_id.clone(),
        status: payload.status.clone(),
        status_info: payload.status_info.clone(),
        status_progress: Some(payload.status_progress as f32),
        summary: None,
        updated_at: Some(chrono::Utc::now().naive_utc()),
        pages_count: metadata
            .pages_count
            .or(payload.pages_count)
            .map(|p| p as i32),
        metadata: Some(metadata),
    });

    // Terminal states won't stream further updates — drop the entry so the
    // map doesn't grow unboundedly
    if matches!(payload.status.as_str(), "ready" | "error" | "deleting") {
        timings.remove(&payload.document_id);
    }
}

/// Node's documentsStatus resolver: record first-seen start and latest end
/// per processing stage (nanosecond timestamps) plus pages/second rates.
fn accumulate_timings(metadata: &mut GqlDocumentMetadata, payload: &StatusNotification) {
    if let Some(pages) = payload.pages_count {
        metadata.pages_count = Some(pages);
    }
    let start = payload.start_time.or(Some(payload.current_time));
    let end = payload.end_time.or(Some(payload.current_time));

    match payload.status.as_str() {
        "batching" => {
            if metadata.batching_started_at.is_none() {
                metadata.batching_started_at = start;
            }
            metadata.batching_ended_at = end;
        }
        "parsing" => {
            if metadata.parsing_started_at.is_none() {
                metadata.parsing_started_at = start;
            }
            metadata.parsing_ended_at = end;
        }
        "chunking" => {
            if metadata.chunking_started_at.is_none() {
                metadata.chunking_started_at = start;
            }
            metadata.chunking_ended_at = end;
        }
        "embedding" => {
            if metadata.embedding_started_at.is_none() {
                metadata.embedding_started_at = start;
            }
            metadata.embedding_ended_at = end;
        }
        "summarizing" | "ready" => {
            if payload.status == "summarizing" && metadata.summarization_started_at.is_none() {
                metadata.summarization_started_at = start;
            }
            metadata.summarization_ended_at = end;
        }
        _ => {}
    }

    if let Some(pages) = metadata.pages_count {
        let rate = |started: Option<f64>, ended: Option<f64>| -> Option<f64> {
            let (s, e) = (started?, ended?);
            let seconds = (e - s) / 1_000_000_000.0;
            (seconds > 0.0).then_some(pages / seconds)
        };
        metadata.batching_page_per_second =
            rate(metadata.batching_started_at, metadata.batching_ended_at)
                .or(metadata.batching_page_per_second);
        metadata.parsing_page_per_second =
            rate(metadata.parsing_started_at, metadata.parsing_ended_at)
                .or(metadata.parsing_page_per_second);
        metadata.chunking_page_per_second =
            rate(metadata.chunking_started_at, metadata.chunking_ended_at)
                .or(metadata.chunking_page_per_second);
        metadata.embedding_page_per_second =
            rate(metadata.embedding_started_at, metadata.embedding_ended_at)
                .or(metadata.embedding_page_per_second);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(status: &str, start: Option<f64>, end: Option<f64>, now: f64) -> StatusNotification {
        StatusNotification {
            document_id: "d1".to_string(),
            status: status.to_string(),
            status_progress: 0.5,
            status_info: None,
            start_time: start,
            end_time: end,
            current_time: now,
            pages_count: Some(10.0),
            sync: true,
        }
    }

    #[test]
    fn accumulates_stage_timings_and_rates() {
        let mut m = GqlDocumentMetadata::default();
        accumulate_timings(&mut m, &payload("parsing", Some(1e9), None, 2e9));
        accumulate_timings(&mut m, &payload("parsing", None, Some(6e9), 6e9));
        assert_eq!(m.parsing_started_at, Some(1e9));
        assert_eq!(m.parsing_ended_at, Some(6e9));
        // 10 pages over 5 seconds
        assert_eq!(m.parsing_page_per_second, Some(2.0));
    }

    #[test]
    fn ready_closes_summarization() {
        let mut m = GqlDocumentMetadata::default();
        accumulate_timings(&mut m, &payload("summarizing", Some(1e9), None, 1e9));
        accumulate_timings(&mut m, &payload("ready", None, None, 9e9));
        assert_eq!(m.summarization_started_at, Some(1e9));
        assert_eq!(m.summarization_ended_at, Some(9e9));
    }

    #[test]
    fn parses_processor_payload() {
        let raw = r#"{"documentId":"abc","status":"parsing","statusProgress":0.4,
            "statusInfo":null,"progress":0.4,"startTime":123,"endTime":null,
            "currentTime":456,"pagesCount":7,"sync":true}"#;
        let n: StatusNotification = serde_json::from_str(raw).unwrap();
        assert_eq!(n.document_id, "abc");
        assert_eq!(n.pages_count, Some(7.0));
        assert!(n.sync);
    }
}
