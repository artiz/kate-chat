-- Create users table
CREATE TABLE users (
    id VARCHAR(64) PRIMARY KEY NOT NULL,
    email TEXT UNIQUE NOT NULL,
    "password" TEXT,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    default_model_id VARCHAR(64),
    default_system_prompt TEXT,
    avatar_url TEXT,
    google_id VARCHAR(255),
    github_id VARCHAR(255),
    microsoft_id VARCHAR(255),
    auth_provider TEXT,
    settings TEXT NULL,
    models_count INTEGER,
    documents_embeddings_model_id VARCHAR(64),
    document_summarization_model_id VARCHAR(64),
    chats_count INTEGER,
    default_temperature REAL DEFAULT 0.7,
    default_max_tokens INTEGER DEFAULT 2048,
    default_top_p REAL DEFAULT 0.9,
    default_images_count INTEGER DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_first_name ON users(first_name);
CREATE INDEX idx_users_last_name ON users(last_name);

-- Create chats table
CREATE TABLE chats (
    id VARCHAR(64) PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    "description" TEXT DEFAULT '',
    user_id VARCHAR(64),
    last_bot_message TEXT,
    last_bot_message_id VARCHAR(64),
    messages_count INTEGER,
    model_id VARCHAR(64),
    system_prompt TEXT,
    tools TEXT,
    temperature REAL,
    max_tokens INTEGER,
    top_p REAL,
    images_count INTEGER,
    is_pristine BOOLEAN NOT NULL DEFAULT 0,
    is_pinned BOOLEAN NOT NULL DEFAULT 0,
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
    "role" TEXT NOT NULL DEFAULT 'user',
    model_id VARCHAR(64),
    model_name TEXT,
    json_content TEXT NULL,
    metadata TEXT NULL,
    linked_to_message_id VARCHAR(64),
    status TEXT,
    status_info TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (linked_to_message_id) REFERENCES messages (id) ON DELETE CASCADE
);

-- Create models table
CREATE TABLE models (
    id VARCHAR(64) PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    model_id VARCHAR(64) NOT NULL,
    "description" TEXT,
    user_id VARCHAR(64),
    provider TEXT,
    api_provider TEXT NOT NULL DEFAULT 'AWS_BEDROCK',
    "type" TEXT NOT NULL DEFAULT 'chat',
    streaming BOOLEAN NOT NULL DEFAULT 0,
    image_input BOOLEAN NOT NULL DEFAULT 0,
    max_input_tokens INTEGER,
    tools TEXT,
    features TEXT,
    custom_settings TEXT,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    is_custom BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE NO ACTION
);

-- Create documents table (RAG)
CREATE TABLE documents (
    id VARCHAR(64) PRIMARY KEY NOT NULL,
    file_name VARCHAR(4000) NOT NULL,
    mime TEXT,
    file_size BIGINT NOT NULL DEFAULT 0,
    sha256checksum TEXT NOT NULL,
    s3key VARCHAR(4000),
    owner_id VARCHAR(64) NOT NULL,
    embeddings_model_id VARCHAR(64),
    summary_model_id VARCHAR(64),
    summary TEXT,
    pages_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'upload',
    status_info TEXT,
    status_progress REAL NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE NO ACTION
);

-- Create document_chunks table (RAG)
CREATE TABLE document_chunks (
    id VARCHAR(64) PRIMARY KEY NOT NULL,
    document_id VARCHAR(64) NOT NULL,
    model_id VARCHAR(64) NOT NULL,
    page INTEGER NOT NULL DEFAULT 0,
    page_index BIGINT NOT NULL DEFAULT 0,
    content TEXT NOT NULL,
    embedding TEXT,
    FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
);

-- Create chat_documents junction table (RAG)
CREATE TABLE chat_documents (
    id VARCHAR(64) PRIMARY KEY NOT NULL,
    chat_id VARCHAR(64) NOT NULL,
    document_id VARCHAR(64) NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
);

-- Create chat_files table
CREATE TABLE chat_files (
    id VARCHAR(64) PRIMARY KEY NOT NULL,
    chat_id VARCHAR(64) NOT NULL,
    message_id VARCHAR(64),
    "type" TEXT NOT NULL DEFAULT 'image',
    file_name TEXT,
    mime TEXT,
    upload_file TEXT,
    predominant_color TEXT,
    exif TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE
);

-- Create mcp_servers table
CREATE TABLE mcp_servers (
    id VARCHAR(64) PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    "description" TEXT,
    transport_type TEXT NOT NULL DEFAULT 'STREAMABLE_HTTP',
    auth_type TEXT NOT NULL DEFAULT 'NONE',
    auth_config TEXT,
    tools TEXT,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    user_id VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX idx_chats_user_id ON chats(user_id);
CREATE INDEX idx_chats_updated_at ON chats(updated_at);

CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_messages_linked_to_message_id ON messages(linked_to_message_id);

CREATE INDEX idx_models_user_id ON models(user_id);
CREATE INDEX idx_models_api_provider ON models(api_provider);
CREATE INDEX idx_models_is_active ON models(is_active);

CREATE INDEX idx_documents_file_name ON documents(file_name);
CREATE INDEX idx_documents_sha256checksum ON documents(sha256checksum);

CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);

CREATE INDEX idx_chat_documents_chat_id ON chat_documents(chat_id);
CREATE INDEX idx_chat_documents_document_id ON chat_documents(document_id);
