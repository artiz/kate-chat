-- Chat folders (sidebar tree) + chat-to-folder assignment
CREATE TABLE chat_folders (
    id VARCHAR(64) PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    user_id VARCHAR(64),
    parent_id VARCHAR(64),
    top_parent_id VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_folders_user_id ON chat_folders(user_id);
CREATE INDEX idx_chat_folders_parent_id ON chat_folders(parent_id);
CREATE INDEX idx_chat_folders_top_parent_id ON chat_folders(top_parent_id);

ALTER TABLE chats ADD COLUMN folder_id VARCHAR(64);
CREATE INDEX idx_chats_folder_id ON chats(folder_id);
