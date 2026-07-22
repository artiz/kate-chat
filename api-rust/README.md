# KateChat API (Rust, experiment)

Alternative backend implementation of the KateChat GraphQL API:
**Rocket** (HTTP) + **async-graphql** (schema; subscriptions over a warp
WebSocket server on `PORT+1`) + **Diesel** (SQLite bundled / PostgreSQL;
MySQL behind a feature flag). The Node/TypeScript API under `../api/`
remains the reference implementation.

## Supported

- **Auth**: register/login (bcrypt + JWT), refresh token, Google/GitHub
  OAuth, demo-mode limits; admin role assigned via `DEFAULT_ADMIN_EMAILS`
  and enforced on admin queries
- **Chats & messages**: CRUD, streaming chat over GraphQL subscriptions,
  message delete/edit, per-chat model/system prompt/settings
- **AI providers**
  - *AWS Bedrock* — native SDK, per-vendor request formatting (Anthropic,
    Amazon, AI21, Cohere, Meta, Mistral), real response streaming, Cost
    Explorer costs
  - *OpenAI* — shared OpenAI protocol client (`services/openai_protocol.rs`):
    chat completions with SSE streaming, embeddings, images generations;
    model classification (chat / embedding / image_generation, image input,
    reasoning-model params)
  - *Yandex AI* — same protocol client against Yandex's OpenAI-compatible
    endpoint with real streaming; `gpt://{folder}/…` model URIs
  - *Custom REST API* — user-defined OpenAI-compatible models (Ollama,
    DeepSeek, vLLM, …): CRUD + connection test (embeddings-aware for
    embedding models), endpoint/apiKey/modelName stored per model
- **Images generation**: image models generate via `/images/generations`,
  results land in S3, `chat_files` and the assistant message
  (markdown `/files/…` links + `jsonContent` blocks)
- **Library**: `getAllImages` / `getChatFiles` paginated queries; files
  are served from S3 via `GET /files/<key>`
- **Admin API**: `getAdminStats`, `getUsers` (paginated search)

## Not ported yet (see the root README TODO)

RAG/documents pipeline (upload → parse → embeddings → retrieval), MCP
tools, web search, chat folders, the OpenAI Responses protocol (gpt-5 /
native tools), realtime voice, message regeneration on edit.

## Develop

```bash
diesel migration run     # DATABASE_URL, defaults to sqlite://katechat.sqlite
cargo run                # PORT (default 4000); subscriptions on PORT+1
cargo test
cargo clippy --all-targets --locked -- -D warnings
cargo fmt
```

Providers are gated by `ENABLED_API_PROVIDERS`
(`AWS_BEDROCK,OPEN_AI,YANDEX_AI,CUSTOM_REST_API` or `*`). Point the client
at it with `APP_API_URL=http://localhost:4001 APP_WS_URL=http://localhost:4002`
(see the root README).

CI (`.github/workflows/ci-cd.yml`, job `rust-api`) runs fmt/clippy/tests
on every change under `api-rust/**`.
