-- MCP servers whose tool calls need the user's approval. api-rust cannot ask for it yet, so it
-- refuses such calls (see services/tools.rs); the Node API asks in the chat.
ALTER TABLE mcp_servers ADD COLUMN require_approval BOOLEAN NOT NULL DEFAULT FALSE;
