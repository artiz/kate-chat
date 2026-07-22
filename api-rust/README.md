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
- **Chat folders**: sidebar tree (create/rename/delete with subtree,
  move chats in/out, folder contents with pagination, pinned filter)
- **MCP servers**: CRUD, live tools listing (`refetchMcpServerTools` /
  `getMcpServerTools`) and single-tool test via a minimal Streamable-HTTP
  JSON-RPC client (initialize / tools/list / tools/call, SSE-aware)
- **In-chat tools**: web search (Yandex Search API v2) and MCP server
  tools run inside the chat session for OpenAI-protocol providers
  (OpenAI / Yandex / custom, function calling) and Bedrock Anthropic
  models (native tool_use); executed calls land in the assistant
  message metadata (`toolCalls` / `tools`)
- **RAG documents**: Node-parity pipeline against the same
  document-processor SQS queues (`SQS_DOCUMENTS_QUEUE` /
  `SQS_INDEX_DOCUMENTS_QUEUE`): multipart upload with sha256 dedup and
  chat linking, parse commands out, index consumer generating chunk
  embeddings (stored as JSON vectors, in-app cosine ranking — no
  pgvector/sqlite-vss dependency) and document summaries, documents
  CRUD + `documentsStatus` subscription, and the structured RAG answer
  flow in `createMessage` (`documentIds` → ranked chunks →
  `ragResponse`/`relevantsChunks` metadata). Intermediate
  document-processor statuses are synced on indexing, not streamed
  (api-rust has no Redis subscriber yet)

## Client compatibility

The web client boots and runs its core flows against api-rust: the
bootstrap `GetInitialData` document (models, chats, folders, appConfig,
mcpServers) and all chat/message/model/Library/admin operations validate
against the schema and execute. Verified by exporting the SDL
(`cargo test export_sdl` → `target/schema.graphql`) and validating every
client GraphQL operation against it. Schema-compat notes: `Chat.settings`
is assembled from the flat chat columns (fields without a backing column
— thinking, voice, cacheRetention, … — are accepted but not persisted),
`mcpEnabled` is true.

## Not ported yet (see the root README TODO)

Operations of unported features return GraphQL validation errors when
used: realtime
voice (createRealtimeSession, addChatMessage), message regeneration
(switchModel, callOther, updateMessageContent, stopMessageGeneration),
forgot/reset password, global search, the OpenAI Responses protocol
(gpt-5 / native tools).

## Develop

```bash
diesel migration run     # DATABASE_URL, defaults to sqlite://katechat.sqlite
cargo run                # PORT (default 4000); subscriptions on PORT+1
cargo test
cargo clippy --all-targets --locked -- -D warnings
cargo fmt
```

> **api-rust needs its own database** — do not point it at the Node API's
> database. The two schemas are incompatible: TypeORM uses camelCase
> columns (`firstName`, `createdAt`) and uuid ids, Diesel uses snake_case
> (`first_name`, `created_at`) and varchar ids. Running `diesel migration
> run` against a Node-created database fails with
> `relation "users" already exists`; create a separate database instead,
> e.g.:
>
> ```bash
> psql "$PG_URL/postgres" -c 'CREATE DATABASE katechat_rust'
> diesel migration run --database-url "$PG_URL/katechat_rust"
> ```
>
> What *is* interchangeable between the backends is the JSON payload
> format (custom-model `customSettings`, message `jsonContent`), not the
> tables themselves.

Providers are gated by `ENABLED_API_PROVIDERS`
(`AWS_BEDROCK,OPEN_AI,YANDEX_AI,CUSTOM_REST_API` or `*`). Point the client
at it with `APP_API_URL=http://localhost:4001 APP_WS_URL=http://localhost:4002`
(see the root README).

CI (`.github/workflows/ci-cd.yml`, job `rust-api`) runs fmt/clippy/tests
on every change under `api-rust/**`.
