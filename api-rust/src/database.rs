use crate::utils::errors::AppError;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool, PooledConnection};
use std::env;
use tracing::{debug, error, info, instrument};

/// One connection type over every supported backend (diesel MultiConnection):
/// all Diesel queries in the codebase are written once against this enum and
/// dispatch to the right backend at runtime. `establish` picks the backend
/// from the URL scheme, trying variants in declaration order — SQLite must
/// stay last because it accepts any string as a file path.
#[derive(diesel::MultiConnection)]
pub enum AnyConnection {
    Postgresql(PgConnection),
    #[cfg(feature = "mysql")]
    Mysql(MysqlConnection),
    Sqlite(SqliteConnection),
}

pub type DbConnection = PooledConnection<ConnectionManager<AnyConnection>>;

#[derive(Clone)]
pub struct DbPool(Pool<ConnectionManager<AnyConnection>>);

impl DbPool {
    pub fn get(&self) -> Result<DbConnection, AppError> {
        self.0.get().map_err(|e| AppError::Database(e.to_string()))
    }
}

// DB_TYPE is only needed when DATABASE_URL is not set (to build a default
// URL); with DATABASE_URL present the backend is inferred from the scheme.
#[derive(Debug, Clone)]
pub enum DatabaseType {
    Sqlite,
    Postgres,
    #[cfg(feature = "mysql")]
    Mysql,
}

impl DatabaseType {
    pub fn from_env() -> Self {
        match env::var("DB_TYPE")
            .unwrap_or_else(|_| "sqlite".to_string())
            .to_lowercase()
            .as_str()
        {
            "postgres" | "postgresql" => DatabaseType::Postgres,
            #[cfg(feature = "mysql")]
            "mysql" => DatabaseType::Mysql,
            _ => DatabaseType::Sqlite,
        }
    }
}

fn get_database_url(db_type: &DatabaseType) -> String {
    if let Ok(url) = env::var("DATABASE_URL").or_else(|_| env::var("DB_URL")) {
        return url;
    }

    match db_type {
        DatabaseType::Sqlite => {
            env::var("DB_NAME").unwrap_or_else(|_| "katechat.sqlite".to_string())
        }
        DatabaseType::Postgres => {
            let host = env::var("DB_HOST").unwrap_or_else(|_| "localhost".to_string());
            let port = env::var("DB_PORT").unwrap_or_else(|_| "5432".to_string());
            let username = env::var("DB_USERNAME").unwrap_or_else(|_| "postgres".to_string());
            let password = env::var("DB_PASSWORD").unwrap_or_else(|_| "".to_string());
            let database = env::var("DB_NAME").unwrap_or_else(|_| "katechat".to_string());

            if password.is_empty() {
                format!("postgresql://{}@{}:{}/{}", username, host, port, database)
            } else {
                format!(
                    "postgresql://{}:{}@{}:{}/{}",
                    username, password, host, port, database
                )
            }
        }
        #[cfg(feature = "mysql")]
        DatabaseType::Mysql => {
            let host = env::var("DB_HOST").unwrap_or_else(|_| "localhost".to_string());
            let port = env::var("DB_PORT").unwrap_or_else(|_| "3306".to_string());
            let username = env::var("DB_USERNAME").unwrap_or_else(|_| "root".to_string());
            let password = env::var("DB_PASSWORD").unwrap_or_else(|_| "".to_string());
            let database = env::var("DB_NAME").unwrap_or_else(|_| "katechat".to_string());

            if password.is_empty() {
                format!("mysql://{}@{}:{}/{}", username, host, port, database)
            } else {
                format!(
                    "mysql://{}:{}@{}:{}/{}",
                    username, password, host, port, database
                )
            }
        }
    }
}

#[instrument]
pub async fn establish_connection() -> DbPool {
    let db_type = DatabaseType::from_env();
    let database_url = get_database_url(&db_type);

    // hide credentials for non-file URLs
    debug!(
        "Establishing database connection to: {}",
        if database_url.contains("://") && !database_url.starts_with("sqlite") {
            database_url
                .split_once('@')
                .map(|(_, rest)| format!("***@{}", rest))
                .unwrap_or_else(|| database_url.clone())
        } else {
            database_url.clone()
        }
    );

    let manager = ConnectionManager::<AnyConnection>::new(database_url);

    match Pool::builder()
        .test_on_check_out(true)
        .max_size(15)
        .build(manager)
    {
        Ok(pool) => {
            info!("Database connection pool created successfully");
            DbPool(pool)
        }
        Err(e) => {
            error!("Failed to create database connection pool: {}", e);
            panic!("Failed to create database pool: {}", e);
        }
    }
}
