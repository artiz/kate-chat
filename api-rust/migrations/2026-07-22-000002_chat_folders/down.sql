DROP INDEX idx_chats_folder_id;
ALTER TABLE chats DROP COLUMN folder_id;
DROP INDEX idx_chat_folders_top_parent_id;
DROP INDEX idx_chat_folders_parent_id;
DROP INDEX idx_chat_folders_user_id;
DROP TABLE chat_folders;
