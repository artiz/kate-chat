use diesel::prelude::*;

use crate::database::DbPool;
use crate::models::ChatWithStats;
use crate::utils::errors::AppError;

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

#[derive(Debug, Default)]
pub struct ChatsQuery {
    pub limit: i32,
    pub offset: i32,
    pub search_term: Option<String>,
    pub user_id: String,
    pub chat_id: Option<String>,
    pub pinned: Option<bool>,
    pub folder_id: Option<String>,
}

pub struct ChatService<'a> {
    db_pool: &'a DbPool,
}

impl<'a> ChatService<'a> {
    pub fn new(db_pool: &'a DbPool) -> Self {
        Self { db_pool }
    }

    /// Chats with message statistics. The raw SQL is standard enough to run
    /// unchanged on every supported backend, so a single implementation
    /// serves them all via the MultiConnection pool.
    pub fn get_chats_with_stats(&self, query: ChatsQuery) -> Result<GetChatStatsResult, AppError> {
        let ChatsQuery {
            limit,
            offset,
            search_term,
            user_id,
            chat_id,
            pinned,
            folder_id,
        } = query;
        let mut conn = self.db_pool.get()?;

        // Build the base query with search filter if needed
        let mut where_clause = format!("WHERE c.user_id = '{}'", user_id);
        if let Some(pinned) = pinned {
            where_clause.push_str(if pinned {
                " AND c.is_pinned = TRUE"
            } else {
                " AND c.is_pinned = FALSE"
            });
        }
        if let Some(folder_id) = &folder_id {
            let escaped = folder_id.replace('\'', "''");
            where_clause.push_str(&format!(" AND (c.folder_id = '{}')", escaped));
        }
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
                CAST(COALESCE(msg_stats.messages_count, 0) AS INTEGER) as messages_count,
                c.model_id,
                c.system_prompt,
                c.tools,
                c.temperature,
                c.max_tokens,
                c.top_p,
                c.images_count,
                c.is_pristine,
                c.is_pinned,
                c.folder_id,
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
            .load(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Total count for pagination — same filters as the list query
        let count_query = format!("SELECT COUNT(*) as count FROM chats c {}", where_clause);
        let result: CountResult = diesel::sql_query(&count_query)
            .get_result(&mut conn)
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(GetChatStatsResult {
            chats,
            total: result.count,
        })
    }
}
