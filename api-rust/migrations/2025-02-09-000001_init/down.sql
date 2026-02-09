-- Drop indexes
DROP INDEX IF EXISTS idx_chat_documents_document_id;
DROP INDEX IF EXISTS idx_chat_documents_chat_id;
DROP INDEX IF EXISTS idx_document_chunks_document_id;
DROP INDEX IF EXISTS idx_documents_sha256checksum;
DROP INDEX IF EXISTS idx_documents_file_name;
DROP INDEX IF EXISTS idx_models_is_active;
DROP INDEX IF EXISTS idx_models_api_provider;
DROP INDEX IF EXISTS idx_models_user_id;
DROP INDEX IF EXISTS idx_messages_linked_to_message_id;
DROP INDEX IF EXISTS idx_messages_created_at;
DROP INDEX IF EXISTS idx_messages_chat_id;
DROP INDEX IF EXISTS idx_chats_updated_at;
DROP INDEX IF EXISTS idx_chats_user_id;
DROP INDEX IF EXISTS idx_users_last_name;
DROP INDEX IF EXISTS idx_users_first_name;

-- Drop tables in reverse order
DROP TABLE IF EXISTS mcp_servers;
DROP TABLE IF EXISTS chat_files;
DROP TABLE IF EXISTS chat_documents;
DROP TABLE IF EXISTS document_chunks;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS models;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS chats;
DROP TABLE IF EXISTS users;