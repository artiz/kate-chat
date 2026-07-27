-- Per-chat realtime voice + reasoning (thinking) settings persistence.
-- Node stores these in the chat's settings JSON; api-rust keeps flat columns.
ALTER TABLE chats ADD COLUMN voice VARCHAR(64);
ALTER TABLE chats ADD COLUMN thinking BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chats ADD COLUMN thinking_budget INTEGER;
