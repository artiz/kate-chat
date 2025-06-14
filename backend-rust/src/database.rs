use diesel::prelude::*;
use diesel::r2d2::{self, ConnectionManager};
use std::env;

pub type DbPool = r2d2::Pool<ConnectionManager<SqliteConnection>>;

pub async fn establish_connection() -> DbPool {
    let database_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite://katechat.sqlite".to_string());
    
    let manager = ConnectionManager::<SqliteConnection>::new(database_url);
    
    r2d2::Pool::builder()
        .build(manager)
        .expect("Failed to create pool.")
}