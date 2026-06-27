//! Minimal HTTP health endpoint, mirroring the Python service's `GET /`.

use std::sync::Arc;

use axum::{routing::get, Json, Router};
use serde_json::json;
use tokio::net::TcpListener;

use crate::config::Config;

/// Serve `GET /` (liveness/version) on `0.0.0.0:<port>` until the process exits.
pub async fn serve(cfg: Arc<Config>) -> anyhow::Result<()> {
    let app = {
        let cfg = cfg.clone();
        Router::new().route(
            "/",
            get(move || {
                let cfg = cfg.clone();
                async move { Json(json!({ "app": cfg.project_name, "version": cfg.version })) }
            }),
        )
    };

    let addr = format!("0.0.0.0:{}", cfg.port);
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!(%addr, "health endpoint listening");
    axum::serve(listener, app).await?;
    Ok(())
}
