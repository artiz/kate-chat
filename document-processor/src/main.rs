//! KateChat document processor.
//!
//! An SQS-driven RAG ingestion service: it consumes `parse_document` /
//! `split_document` commands, converts documents with `fleischwolf`, writes the
//! Markdown / chunked artifacts to S3, reports progress over Redis, and enqueues
//! documents for indexing. The Rust replacement for the Python `document-processor`.

mod aws;
mod chunker;
mod config;
mod health;
mod logging;
mod model;
mod parser;
mod processor;
mod redis_status;
mod s3;
mod sqs;

use std::sync::Arc;

use anyhow::Context;
use tokio_util::sync::CancellationToken;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let cfg = Arc::new(config::Config::from_env()?);
    logging::init(&cfg.log_level);

    tracing::info!(
        version = %cfg.version,
        commit = %cfg.commit_sha,
        environment = %cfg.environment,
        workers = cfg.num_threads,
        "starting {}",
        cfg.project_name
    );

    let s3_client = aws::s3_client(&cfg).await;
    let sqs_client = aws::sqs_client(&cfg).await;
    let s3 = s3::S3::new(s3_client, cfg.s3_files_bucket_name.clone());
    let status =
        redis_status::StatusPublisher::connect(&cfg.redis_url, &cfg.document_status_channel)
            .await
            .context("connect to Redis")?;

    let processor = Arc::new(processor::Processor::new(
        s3,
        sqs_client.clone(),
        status,
        cfg.clone(),
    ));

    // Health endpoint.
    {
        let cfg = cfg.clone();
        tokio::spawn(async move {
            if let Err(err) = health::serve(cfg).await {
                tracing::error!(error = %err, "health server exited");
            }
        });
    }

    // Graceful shutdown on SIGINT / SIGTERM.
    let shutdown = CancellationToken::new();
    {
        let shutdown = shutdown.clone();
        tokio::spawn(async move {
            wait_for_shutdown().await;
            tracing::info!("shutdown signal received");
            shutdown.cancel();
        });
    }

    sqs::run(processor, sqs_client, cfg.clone(), shutdown).await;
    tracing::info!("document processor stopped");
    Ok(())
}

async fn wait_for_shutdown() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut term = match signal(SignalKind::terminate()) {
            Ok(s) => s,
            Err(_) => {
                let _ = tokio::signal::ctrl_c().await;
                return;
            }
        };
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
