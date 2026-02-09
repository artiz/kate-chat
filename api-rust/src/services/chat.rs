use diesel::prelude::*;

use crate::database::DbPool;
use crate::models::ChatWithStats;
use crate::schema::chats;
use crate::utils::errors::AppError;

#[cfg(feature = "mysql")]
use diesel::MysqlConnection;
use diesel::{PgConnection, SqliteConnection};

// Struct for count result
#[derive(QueryableByName, Debug)]
struct CountResult {
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    pub count: i64,
}

pub struct GetChatStatsResult {
    pub chats: Vec<ChatWithStats>,
    pub total: i64,
}

pub struct ChatService<'a> {
    db_pool: &'a DbPool,
}

impl<'a> ChatService<'a> {
    pub fn new(db_pool: &'a DbPool) -> Self {
        Self { db_pool }
    }

    pub fn get_chats_with_stats(
        &self,
        limit: i32,
        offset: i32,
        search_term: Option<String>,
        user_id: String,
        chat_id: Option<String>,
    ) -> Result<GetChatStatsResult, AppError> {
        match self.db_pool {
            DbPool::Sqlite(pool) => {
                let mut conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;
                self.get_chats_with_stats_sqlite(
                    &mut conn,
                    limit,
                    offset,
                    search_term,
                    user_id,
                    chat_id,
                )
            }
            DbPool::Postgres(pool) => {
                let mut conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;
                self.get_chats_with_stats_postgres(
                    &mut conn,
                    limit,
                    offset,
                    search_term,
                    user_id,
                    chat_id,
                )
            }
            #[cfg(feature = "mysql")]
            DbPool::Mysql(pool) => {
                let mut conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;
                self.get_chats_with_stats_mysql(
                    &mut conn,
                    limit,
                    offset,
                    search_term,
                    user_id,
                    chat_id,
                )
            }
        }
    }

    fn get_chats_with_stats_sqlite(
        &self,
        conn: &mut SqliteConnection,
        limit: i32,
        offset: i32,
        search_term: Option<String>,
        user_id: String,
        chat_id: Option<String>,
    ) -> Result<GetChatStatsResult, AppError> {
        // Build the base query with search filter if needed
        let mut where_clause = format!("WHERE c.user_id = '{}'", user_id);
        if let Some(search_term) = &search_term {
            let escaped_term = search_term.replace('\'', "''"); // Basic SQL injection protection
            where_clause.push_str(&format!(
                " AND (c.title LIKE '%{}%' OR c.description LIKE '%{}%')",
                escaped_term, escaped_term
            ));
        }

        if let Some(chat_id) = &chat_id {
            where_clause.push_str(&format!(" AND (c.id = '{}')", chat_id));
        }

        // Complex SQL query to get chats with message statistics
        let sql_query = format!(
            r#"
            SELECT 
                c.id,
                c.title,
                c.description,
                c.user_id,
                last_bot.content as last_bot_message,
                last_bot.id as last_bot_message_id,
                COALESCE(msg_stats.messages_count, 0) as messages_count,
                c.model_id,
                c.system_prompt,
                c.tools,
                c.temperature,
                c.max_tokens,
                c.top_p,
                c.images_count,
                c.is_pristine,
                c.is_pinned,
                c.created_at,
                c.updated_at
            FROM chats c
            LEFT JOIN (
                SELECT 
                    chat_id,
                    COUNT(*) as messages_count
                FROM messages 
                GROUP BY chat_id
            ) msg_stats ON c.id = msg_stats.chat_id
            LEFT JOIN (
                SELECT DISTINCT
                    m1.chat_id,
                    m1.id,
                    m1.content
                FROM messages m1
                WHERE m1.role = 'assistant'
                    AND m1.created_at = (
                        SELECT MAX(m2.created_at)
                        FROM messages m2
                        WHERE m2.chat_id = m1.chat_id 
                            AND m2.role = 'assistant'
                    )
            ) last_bot ON c.id = last_bot.chat_id
            {}
            ORDER BY c.updated_at DESC
            LIMIT {} OFFSET {}
            "#,
            where_clause, limit, offset
        );

        let chats = diesel::sql_query(&sql_query)
            .load(conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Get total count (for pagination) - apply the same search filter
        let total: i64 = if search_term.is_some() {
            // For searches, count using the same filter
            let count_query = format!("SELECT COUNT(*) as count FROM chats c {}", where_clause);
            let result: CountResult = diesel::sql_query(&count_query)
                .get_result(conn)
                .map_err(|e| AppError::Database(e.to_string()))?;
            result.count
        } else {
            // For non-search queries, use the simple count
            chats::table
                .filter(chats::user_id.eq(&user_id))
                .count()
                .get_result(conn)
                .map_err(|e| AppError::Database(e.to_string()))?
        };

        Ok(GetChatStatsResult { chats, total })
    }

    fn get_chats_with_stats_postgres(
        &self,
        conn: &mut PgConnection,
        limit: i32,
        offset: i32,
        search_term: Option<String>,
        user_id: String,
        chat_id: Option<String>,
    ) -> Result<GetChatStatsResult, AppError> {
        // PostgreSQL implementation - same logic as SQLite
        let mut where_clause = format!("WHERE c.user_id = '{}'", user_id);
        if let Some(search_term) = &search_term {
            let escaped_term = search_term.replace('\'', "''");
            where_clause.push_str(&format!(
                " AND (c.title LIKE '%{}%' OR c.description LIKE '%{}%')",
                escaped_term, escaped_term
            ));
        }
        if let Some(chat_id) = &chat_id {
            where_clause.push_str(&format!(" AND (c.id = '{}')", chat_id));
        }

        let sql_query = format!(
            r#"
            SELECT 
                c.id,
                c.title,
                c.description,
                c.user_id,
                last_bot.content as last_bot_message,
                last_bot.id as last_bot_message_id,
                COALESCE(msg_stats.messages_count, 0) as messages_count,
                c.model_id,
                c.system_prompt,
                c.tools,
                c.temperature,
                c.max_tokens,
                c.top_p,
                c.images_count,
                c.is_pristine,
                c.is_pinned,
                c.created_at,
                c.updated_at
            FROM chats c
            LEFT JOIN (
                SELECT 
                    chat_id,
                    COUNT(*) as messages_count
                FROM messages 
                GROUP BY chat_id
            ) msg_stats ON c.id = msg_stats.chat_id
            LEFT JOIN (
                SELECT DISTINCT
                    m1.chat_id,
                    m1.id,
                    m1.content
                FROM messages m1
                WHERE m1.role = 'assistant'
                    AND m1.created_at = (
                        SELECT MAX(m2.created_at)
                        FROM messages m2
                        WHERE m2.chat_id = m1.chat_id 
                            AND m2.role = 'assistant'
                    )
            ) last_bot ON c.id = last_bot.chat_id
            {}
            ORDER BY c.updated_at DESC
            LIMIT {} OFFSET {}
            "#,
            where_clause, limit, offset
        );

        let chats = diesel::sql_query(&sql_query)
            .load(conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let total: i64 = if search_term.is_some() {
            let count_query = format!("SELECT COUNT(*) as count FROM chats c {}", where_clause);
            let result: CountResult = diesel::sql_query(&count_query)
                .get_result(conn)
                .map_err(|e| AppError::Database(e.to_string()))?;
            result.count
        } else {
            chats::table
                .filter(chats::user_id.eq(&user_id))
                .count()
                .get_result(conn)
                .map_err(|e| AppError::Database(e.to_string()))?
        };

        Ok(GetChatStatsResult { chats, total })
    }

    #[cfg(feature = "mysql")]
    fn get_chats_with_stats_mysql(
        &self,
        conn: &mut MysqlConnection,
        limit: i32,
        offset: i32,
        search_term: Option<String>,
        user_id: String,
        chat_id: Option<String>,
    ) -> Result<GetChatStatsResult, AppError> {
        // MySQL implementation - same logic as SQLite
        let mut where_clause = format!("WHERE c.user_id = '{}'", user_id);
        if let Some(search_term) = &search_term {
            let escaped_term = search_term.replace('\'', "''");
            where_clause.push_str(&format!(
                " AND (c.title LIKE '%{}%' OR c.description LIKE '%{}%')",
                escaped_term, escaped_term
            ));
        }
        if let Some(chat_id) = &chat_id {
            where_clause.push_str(&format!(" AND (c.id = '{}')", chat_id));
        }

        let sql_query = format!(
            r#"
            SELECT 
                c.id,
                c.title,
                c.description,
                c.user_id,
                last_bot.content as last_bot_message,
                last_bot.id as last_bot_message_id,
                COALESCE(msg_stats.messages_count, 0) as messages_count,
                c.model_id,
                c.system_prompt,
                c.tools,
                c.temperature,
                c.max_tokens,
                c.top_p,
                c.images_count,
                c.is_pristine,
                c.is_pinned,
                c.created_at,
                c.updated_at
            FROM chats c
            LEFT JOIN (
                SELECT 
                    chat_id,
                    COUNT(*) as messages_count
                FROM messages 
                GROUP BY chat_id
            ) msg_stats ON c.id = msg_stats.chat_id
            LEFT JOIN (
                SELECT DISTINCT
                    m1.chat_id,
                    m1.id,
                    m1.content
                FROM messages m1
                WHERE m1.role = 'assistant'
                    AND m1.created_at = (
                        SELECT MAX(m2.created_at)
                        FROM messages m2
                        WHERE m2.chat_id = m1.chat_id 
                            AND m2.role = 'assistant'
                    )
            ) last_bot ON c.id = last_bot.chat_id
            {}
            ORDER BY c.updated_at DESC
            LIMIT {} OFFSET {}
            "#,
            where_clause, limit, offset
        );

        let chats = diesel::sql_query(&sql_query)
            .load(conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let total: i64 = if search_term.is_some() {
            let count_query = format!("SELECT COUNT(*) as count FROM chats c {}", where_clause);
            let result: CountResult = diesel::sql_query(&count_query)
                .get_result(conn)
                .map_err(|e| AppError::Database(e.to_string()))?;
            result.count
        } else {
            chats::table
                .filter(chats::user_id.eq(&user_id))
                .count()
                .get_result(conn)
                .map_err(|e| AppError::Database(e.to_string()))?
        };

        Ok(GetChatStatsResult { chats, total })
    }
}
