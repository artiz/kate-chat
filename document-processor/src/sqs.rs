//! SQS polling loop. Runs `num_threads` concurrent pollers against the documents
//! queue, each processing one message at a time with a visibility-timeout
//! heartbeat so long-running (ML PDF) conversions are not redelivered mid-flight.

use std::sync::Arc;
use std::time::Duration;

use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::config::Config;
use crate::model::Command;
use crate::processor::Processor;

/// Start the pollers and run until `shutdown` is cancelled.
pub async fn run(
    processor: Arc<Processor>,
    sqs: aws_sdk_sqs::Client,
    cfg: Arc<Config>,
    shutdown: CancellationToken,
) {
    let mut workers = Vec::with_capacity(cfg.num_threads);
    for idx in 0..cfg.num_threads {
        let processor = processor.clone();
        let sqs = sqs.clone();
        let cfg = cfg.clone();
        let shutdown = shutdown.clone();
        workers.push(tokio::spawn(async move {
            poll_loop(idx, processor, sqs, cfg, shutdown).await
        }));
    }
    for worker in workers {
        let _ = worker.await;
    }
}

async fn poll_loop(
    idx: usize,
    processor: Arc<Processor>,
    sqs: aws_sdk_sqs::Client,
    cfg: Arc<Config>,
    shutdown: CancellationToken,
) {
    let queue = cfg.sqs_documents_queue.clone();
    tracing::info!(worker = idx, queue = %queue, "sqs poller started");

    while !shutdown.is_cancelled() {
        let received = tokio::select! {
            _ = shutdown.cancelled() => break,
            result = sqs
                .receive_message()
                .queue_url(&queue)
                .max_number_of_messages(1)
                .wait_time_seconds(5)
                .visibility_timeout(cfg.visibility_timeout)
                .send() => result,
        };

        let output = match received {
            Ok(output) => output,
            Err(err) => {
                tracing::error!(worker = idx, error = %err, "receive_message failed");
                // Back off, but wake immediately on shutdown.
                tokio::select! {
                    _ = shutdown.cancelled() => break,
                    _ = tokio::time::sleep(Duration::from_secs(5)) => {}
                }
                continue;
            }
        };

        for message in output.messages() {
            let receipt = match message.receipt_handle() {
                Some(r) => r.to_string(),
                None => continue,
            };
            let body = message.body().unwrap_or_default().to_string();

            let cmd: Command = match serde_json::from_str(&body) {
                Ok(cmd) => cmd,
                Err(err) => {
                    tracing::error!(worker = idx, error = %err, body = %body, "invalid message body; dropping");
                    delete_message(&sqs, &queue, &receipt).await;
                    continue;
                }
            };

            tracing::info!(worker = idx, ?cmd, "processing message");
            let heartbeat = spawn_heartbeat(
                sqs.clone(),
                queue.clone(),
                receipt.clone(),
                cfg.visibility_timeout,
            );
            let result = processor.handle_command(cmd).await;
            heartbeat.abort();

            match result {
                Ok(()) => delete_message(&sqs, &queue, &receipt).await,
                Err(err) => {
                    // Transient/infra failure: leave the message for redelivery.
                    tracing::error!(
                        worker = idx,
                        error = format!("{err:#}"),
                        "processing failed; will retry"
                    );
                }
            }
        }
    }

    tracing::info!(worker = idx, "sqs poller stopped");
}

/// Periodically extend the message visibility while it is being processed.
fn spawn_heartbeat(
    sqs: aws_sdk_sqs::Client,
    queue: String,
    receipt: String,
    visibility: i32,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let interval = Duration::from_secs(((visibility as u64) / 2).max(10));
        loop {
            tokio::time::sleep(interval).await;
            if let Err(err) = sqs
                .change_message_visibility()
                .queue_url(&queue)
                .receipt_handle(&receipt)
                .visibility_timeout(visibility)
                .send()
                .await
            {
                tracing::warn!(error = %err, "change_message_visibility failed");
                break;
            }
        }
    })
}

async fn delete_message(sqs: &aws_sdk_sqs::Client, queue: &str, receipt: &str) {
    if let Err(err) = sqs
        .delete_message()
        .queue_url(queue)
        .receipt_handle(receipt)
        .send()
        .await
    {
        tracing::warn!(error = %err, "delete_message failed");
    }
}
