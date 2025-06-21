use diesel::prelude::*;
use diesel::r2d2::{self, ConnectionManager};
use std::env;
use tracing::{debug, error, info, instrument};

pub type DbPool = r2d2::Pool<ConnectionManager<SqliteConnection>>;

#[instrument]
pub async fn establish_connection() -> DbPool {
    let database_url =
        env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://katechat.sqlite".to_string());

    debug!(
        "Establishing database connection to: {}",
        if database_url.starts_with("sqlite://") {
            &database_url
        } else {
            "***hidden***"
        }
    );

    let manager = ConnectionManager::<SqliteConnection>::new(database_url.clone());

    match r2d2::Pool::builder()
        .test_on_check_out(true)
        .max_size(15)
        .build(manager)
    {
        Ok(pool) => {
            info!("Database connection pool created successfully");
            pool
        }
        Err(e) => {
            error!("Failed to create database connection pool: {}", e);
            panic!("Failed to create database pool: {}", e);
        }
    }
}
