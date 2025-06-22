use crate::utils::errors::AppError;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use std::env;
use tracing::{debug, error, info, instrument};

// Define connection types for different databases
pub type SqlitePool = Pool<ConnectionManager<SqliteConnection>>;
pub type PostgresPool = Pool<ConnectionManager<PgConnection>>;

#[cfg(feature = "mysql")]
pub type MysqlPool = Pool<ConnectionManager<MysqlConnection>>;

// Enum to represent different database types
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
            "sqlite" | _ => DatabaseType::Sqlite,
        }
    }
}

// Enum to hold different connection pool types
#[derive(Clone)]
pub enum DbPool {
    Sqlite(SqlitePool),
    Postgres(PostgresPool),
    #[cfg(feature = "mysql")]
    Mysql(MysqlPool),
}

impl DbPool {
    // Legacy method for compatibility - delegates to SQLite
    pub fn get(
        &self,
    ) -> Result<diesel::r2d2::PooledConnection<ConnectionManager<SqliteConnection>>, AppError> {
        match self {
            DbPool::Sqlite(pool) => pool.get().map_err(|e| AppError::Database(e.to_string())),
            DbPool::Postgres(_) => Err(AppError::Database(
                "PostgreSQL support is planned for future release. Please use SQLite for now."
                    .to_string(),
            )),
            #[cfg(feature = "mysql")]
            DbPool::Mysql(_) => Err(AppError::Database(
                "MySQL support is planned for future release. Please use SQLite for now."
                    .to_string(),
            )),
        }
    }
}

fn get_database_url(db_type: &DatabaseType) -> String {
    match db_type {
        DatabaseType::Sqlite => env::var("DATABASE_URL")
            .or_else(|_| env::var("DB_NAME"))
            .unwrap_or_else(|_| "katechat.sqlite".to_string()),
        DatabaseType::Postgres => {
            env::var("DATABASE_URL")
                .or_else(|_| env::var("DB_URL"))
                .unwrap_or_else(|_| {
                    // Construct from individual components if URL not provided
                    let host = env::var("DB_HOST").unwrap_or_else(|_| "localhost".to_string());
                    let port = env::var("DB_PORT").unwrap_or_else(|_| "5432".to_string());
                    let username =
                        env::var("DB_USERNAME").unwrap_or_else(|_| "postgres".to_string());
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
                })
        }
        #[cfg(feature = "mysql")]
        DatabaseType::Mysql => {
            env::var("DATABASE_URL")
                .or_else(|_| env::var("DB_URL"))
                .unwrap_or_else(|_| {
                    // Construct from individual components if URL not provided
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
                })
        }
    }
}

#[instrument]
pub async fn establish_connection() -> DbPool {
    let db_type = DatabaseType::from_env();
    let database_url = get_database_url(&db_type);

    debug!(
        "Establishing {} database connection to: {}",
        match db_type {
            DatabaseType::Sqlite => "SQLite",
            DatabaseType::Postgres => "PostgreSQL",
            #[cfg(feature = "mysql")]
            DatabaseType::Mysql => "MySQL",
        },
        if matches!(db_type, DatabaseType::Sqlite) {
            &database_url
        } else {
            "***hidden***"
        }
    );

    match db_type {
        DatabaseType::Sqlite => {
            let manager = ConnectionManager::<SqliteConnection>::new(database_url.clone());

            match Pool::builder()
                .test_on_check_out(true)
                .max_size(15)
                .build(manager)
            {
                Ok(pool) => {
                    info!("SQLite database connection pool created successfully");
                    DbPool::Sqlite(pool)
                }
                Err(e) => {
                    error!("Failed to create SQLite database connection pool: {}", e);
                    panic!("Failed to create SQLite database pool: {}", e);
                }
            }
        }
        DatabaseType::Postgres => {
            let manager = ConnectionManager::<PgConnection>::new(database_url.clone());

            match Pool::builder()
                .test_on_check_out(true)
                .max_size(15)
                .build(manager)
            {
                Ok(pool) => {
                    info!("PostgreSQL database connection pool created successfully");
                    DbPool::Postgres(pool)
                }
                Err(e) => {
                    error!(
                        "Failed to create PostgreSQL database connection pool: {}",
                        e
                    );
                    panic!("Failed to create PostgreSQL database pool: {}", e);
                }
            }
        }
        #[cfg(feature = "mysql")]
        DatabaseType::Mysql => {
            let manager = ConnectionManager::<MysqlConnection>::new(database_url.clone());

            match Pool::builder()
                .test_on_check_out(true)
                .max_size(15)
                .build(manager)
            {
                Ok(pool) => {
                    info!("MySQL database connection pool created successfully");
                    DbPool::Mysql(pool)
                }
                Err(e) => {
                    error!("Failed to create MySQL database connection pool: {}", e);
                    panic!("Failed to create MySQL database pool: {}", e);
                }
            }
        }
    }
}
