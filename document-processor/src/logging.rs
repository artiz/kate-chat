//! Tracing/log initialization.

use tracing_subscriber::{fmt, prelude::*, EnvFilter};

/// Initialize the global tracing subscriber. Honors `RUST_LOG`, falling back to
/// the configured `LOG_LEVEL` (default `info`).
pub fn init(log_level: &str) {
    let default = log_level.to_ascii_lowercase();
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(format!("katechat_document_processor={default},info")));

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().with_target(true).compact())
        .init();
}
