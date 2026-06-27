//! Progress reporting over Redis: a `SETEX` progress key plus a pub/sub
//! notification on the `document:status` channel, matching the Python service.

use redis::AsyncCommands;

use crate::model::StatusNotification;

/// Nanoseconds since the Unix epoch (the unit the API/client expect).
pub fn now_ns() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0)
}

/// Cloneable handle that publishes progress updates.
#[derive(Clone)]
pub struct StatusPublisher {
    conn: redis::aio::MultiplexedConnection,
    channel: String,
}

/// Arguments for a single progress update. Build with [`ProgressArgs::new`] and
/// the chainable setters for the optional fields.
pub struct ProgressArgs<'a> {
    progress_key: &'a str,
    document_id: &'a str,
    status: &'a str,
    progress: f64,
    info: Option<&'a str>,
    start_time: Option<u64>,
    end_time: Option<u64>,
    pages_count: Option<u32>,
    expire: u64,
}

impl<'a> ProgressArgs<'a> {
    pub fn new(
        progress_key: &'a str,
        document_id: &'a str,
        status: &'a str,
        progress: f64,
    ) -> Self {
        Self {
            progress_key,
            document_id,
            status,
            progress,
            info: None,
            start_time: None,
            end_time: None,
            pages_count: None,
            expire: 30,
        }
    }
    pub fn info(mut self, info: &'a str) -> Self {
        self.info = Some(info);
        self
    }
    pub fn start_time(mut self, t: u64) -> Self {
        self.start_time = Some(t);
        self
    }
    pub fn end_time(mut self, t: u64) -> Self {
        self.end_time = Some(t);
        self
    }
    pub fn pages_count(mut self, n: u32) -> Self {
        self.pages_count = Some(n);
        self
    }
}

impl StatusPublisher {
    pub async fn connect(url: &str, channel: &str) -> anyhow::Result<Self> {
        let client = redis::Client::open(url)?;
        let conn = client.get_multiplexed_async_connection().await?;
        Ok(Self {
            conn,
            channel: channel.to_string(),
        })
    }

    /// Set the progress key (with TTL) and publish a status notification.
    /// Best-effort: failures are logged, never propagated.
    pub async fn set_progress(&self, args: ProgressArgs<'_>) {
        let mut conn = self.conn.clone();

        if let Err(e) = conn
            .set_ex::<_, _, ()>(args.progress_key, args.progress.to_string(), args.expire)
            .await
        {
            tracing::warn!(error = %e, key = %args.progress_key, "redis setex failed");
        }

        let notification = StatusNotification {
            document_id: args.document_id.to_string(),
            status: args.status.to_string(),
            status_progress: args.progress,
            status_info: args.info.map(|s| s.to_string()),
            progress: args.progress,
            start_time: args.start_time,
            end_time: args.end_time,
            current_time: now_ns(),
            pages_count: args.pages_count,
            sync: true,
        };

        match serde_json::to_string(&notification) {
            Ok(payload) => {
                if let Err(e) = conn
                    .publish::<_, _, ()>(self.channel.as_str(), payload)
                    .await
                {
                    tracing::warn!(error = %e, "redis publish failed");
                }
            }
            Err(e) => tracing::warn!(error = %e, "serialize status notification failed"),
        }
    }
}
