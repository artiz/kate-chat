-- Drop indexes
DROP INDEX IF EXISTS idx_models_is_active;
DROP INDEX IF EXISTS idx_models_api_provider;
DROP INDEX IF EXISTS idx_models_user_id;
DROP INDEX IF EXISTS idx_messages_created_at;
DROP INDEX IF EXISTS idx_messages_chat_id;
DROP INDEX IF EXISTS idx_chats_updated_at;
DROP INDEX IF EXISTS idx_chats_user_id;

-- Drop tables in reverse order
DROP TABLE IF EXISTS models;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS chats;
DROP TABLE IF EXISTS users;