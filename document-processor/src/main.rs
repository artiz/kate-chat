//! KateChat document processor.
//!
//! An SQS-driven RAG ingestion service: it consumes `parse_document` /
//! `split_document` commands, converts documents with `docling`, writes the
//! Markdown / chunked artifacts to S3, reports progress over Redis, and enqueues
//! documents for indexing. The Rust replacement for the Python `document-processor`.

mod aws;
mod chunker;
mod config;
mod health;
mod logging;
mod model;
mod parser;
mod pdf;
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
    let s3 = s3::S3::new(
        s3_client,
        cfg.s3_files_bucket_name.clone(),
        std::time::Duration::from_secs(cfg.s3_timeout_seconds),
    );
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

    // Run the SQS pollers in the background so the main task can wait on the
    // shutdown signal and stop promptly — even while a worker is mid-conversion.
    // A blocking ML parse can't be interrupted, so we must not block on draining it.
    let shutdown = CancellationToken::new();
    let pollers = {
        let shutdown = shutdown.clone();
        let cfg = cfg.clone();
        tokio::spawn(async move { sqs::run(processor, sqs_client, cfg, shutdown).await })
    };

    // Graceful shutdown on SIGINT / SIGTERM.
    wait_for_shutdown().await;
    tracing::info!("shutdown signal received, stopping");
    shutdown.cancel();

    // A second signal skips the drain and terminates right away.
    tokio::spawn(async {
        wait_for_shutdown().await;
        tracing::info!("second shutdown signal — terminating immediately");
        hard_exit(130);
    });

    // Best-effort drain of idle pollers, then force-exit so an in-flight (blocking)
    // conversion or a lingering background task can't keep the process alive.
    let _ = tokio::time::timeout(std::time::Duration::from_secs(5), pollers).await;
    tracing::info!("document processor stopped");
    hard_exit(0)
}

/// Terminate without running atexit handlers. `std::process::exit` runs
/// them, and ONNX Runtime's global-environment teardown joins its worker
/// threads there — with live inference threads (or the CUDA EP) that
/// hangs or segfaults, leaving an unkillable-by-^C process. There is
/// nothing to flush at this point, so skip atexit entirely.
fn hard_exit(code: i32) -> ! {
    #[cfg(unix)]
    unsafe {
        libc::_exit(code)
    }
    #[cfg(not(unix))]
    std::process::exit(code)
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
