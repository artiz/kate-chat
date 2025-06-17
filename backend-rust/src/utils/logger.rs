use std::env;
use std::io;
use tracing_subscriber::{
    fmt::{self, time::SystemTime},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter,
};
use tracing_appender::{non_blocking, rolling};

/// Initialize the logging system
pub fn init_logging() {
    let log_level = env::var("LOG_LEVEL")
        .unwrap_or_else(|_| {
            if env::var("ENVIRONMENT").unwrap_or_default() == "production" {
                "info".to_string()
            } else {
                "debug".to_string()
            }
        });

    let is_production = env::var("ENVIRONMENT").unwrap_or_default() == "production";

    // Create env filter
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| {
            EnvFilter::new(format!("kate_chat_backend={},tower_http=debug,sqlx=info", log_level))
        });

    if is_production {
        // Production: JSON logs to file
        let file_appender = rolling::daily("logs", "kate-chat-backend.log");
        let (non_blocking_file, _guard) = non_blocking(file_appender);
        
        let file_layer = fmt::layer()
            .json()
            .with_timer(SystemTime)
            .with_target(true)
            .with_thread_ids(true)
            .with_writer(non_blocking_file);

        tracing_subscriber::registry()
            .with(env_filter)
            .with(file_layer)
            .init();

        // Keep the guard alive for the duration of the program
        std::mem::forget(_guard);
    } else {
        // Development: Pretty console logs
        let console_layer = fmt::layer()
            .pretty()
            .with_timer(SystemTime)
            .with_target(true)
            .with_thread_ids(true)
            .with_writer(io::stdout);

        tracing_subscriber::registry()
            .with(env_filter)
            .with(console_layer)
            .init();
    }
}

/// Create a span for request tracing
#[macro_export]
macro_rules! request_span {
    ($name:expr, $($field:tt)*) => {
        tracing::info_span!($name, $($field)*)
    };
}

/// Create a span for database operations
#[macro_export]
macro_rules! db_span {
    ($name:expr, $($field:tt)*) => {
        tracing::debug_span!("db", operation = $name, $($field)*)
    };
}

/// Create a span for external API calls
#[macro_export]
macro_rules! api_span {
    ($provider:expr, $operation:expr, $($field:tt)*) => {
        tracing::info_span!("api_call", provider = $provider, operation = $operation, $($field)*)
    };
}

/// Log user action with context
#[macro_export]
macro_rules! log_user_action {
    ($user_id:expr, $action:expr, $($field:tt)*) => {
        tracing::info!(
            user_id = $user_id,
            action = $action,
            $($field)*
        );
    };
}

/// Log security event
#[macro_export]
macro_rules! log_security_event {
    ($event:expr, $($field:tt)*) => {
        tracing::warn!(
            security_event = $event,
            $($field)*
        );
    };
}

/// Log performance metrics
#[macro_export]
macro_rules! log_performance {
    ($operation:expr, $duration:expr, $($field:tt)*) => {
        tracing::info!(
            performance = $operation,
            duration_ms = $duration.as_millis() as u64,
            $($field)*
        );
    };
}

/// Create logger for current module (simplified version)
#[macro_export]
macro_rules! create_logger {
    () => {
        tracing::info!("Logger created for module: {}", module_path!())
    };
}
