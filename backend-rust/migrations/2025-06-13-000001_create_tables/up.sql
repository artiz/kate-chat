-- Create users table
CREATE TABLE users (
    id VARCHAR(64) PRIMARY KEY NOT NULL,
    email TEXT UNIQUE NOT NULL,
    "password" TEXT,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    default_model_id VARCHAR(64),
    default_system_prompt TEXT,
    avatar_url TEXT,
    google_id VARCHAR(255),
    github_id VARCHAR(255),
    auth_provider TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create chats table
CREATE TABLE chats (
    id VARCHAR(64) PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    user_id VARCHAR(64),
    files TEXT,
    -- JSON string
    last_bot_message TEXT,
    last_bot_message_id VARCHAR(64),
    messages_count INTEGER DEFAULT 0,
    model_id VARCHAR(64),
    temperature REAL,
    max_tokens INTEGER,
    top_p REAL,
    is_pristine BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Create messages table
CREATE TABLE messages (
    id VARCHAR(64) PRIMARY KEY NOT NULL,
    chat_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64),
    content TEXT NOT NULL,
    role TEXT NOT NULL,
    model_id VARCHAR(64) NOT NULL,
    model_name TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE
    SET
        NULL
);

-- Create models table
CREATE TABLE models (
    id VARCHAR(64) PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    model_id VARCHAR(64) NOT NULL,
    api_provider TEXT NOT NULL,
    provider TEXT,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    is_custom BOOLEAN NOT NULL DEFAULT 0,
    supports_text_in BOOLEAN NOT NULL DEFAULT 1,
    supports_text_out BOOLEAN NOT NULL DEFAULT 1,
    supports_image_in BOOLEAN NOT NULL DEFAULT 0,
    supports_image_out BOOLEAN NOT NULL DEFAULT 0,
    supports_embeddings_in BOOLEAN NOT NULL DEFAULT 0,
    supports_embeddings_out BOOLEAN NOT NULL DEFAULT 0,
    supports_streaming BOOLEAN NOT NULL DEFAULT 1,
    user_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_chats_user_id ON chats(user_id);

CREATE INDEX idx_chats_updated_at ON chats(updated_at);

CREATE INDEX idx_messages_chat_id ON messages(chat_id);

CREATE INDEX idx_messages_created_at ON messages(created_at);

CREATE INDEX idx_models_user_id ON models(user_id);

CREATE INDEX idx_models_api_provider ON models(api_provider);

CREATE INDEX idx_models_is_active ON models(is_active);
