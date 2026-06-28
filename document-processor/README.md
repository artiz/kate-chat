# KateChat Document Processor (Rust)

SQS-driven RAG ingestion service. It converts uploaded documents to Markdown +
chunks for embedding, reporting progress over Redis. This is the Rust replacement
for the previous Python service (archived under `../document-processor-python/`),
built on [**fleischwolf**](https://github.com/artiz/fleischwolf) — a Rust port of
[docling](https://github.com/docling-project/docling).

## Pipeline

```
SQS documents-queue
  ├─ parse_document → fleischwolf convert → S3 {key}.parsed.json (docling JSON, internal)
  │                                        S3 {key}.parsed.md   (Markdown, for summaries)
  │                                      → enqueue split_document
  └─ split_document → clean + chunk      → S3 {key}.chunked.json
                                         → enqueue index_document (index-queue)
```

Progress for every stage is published to the Redis `document:status` channel (and
mirrored to a `{key}.parsing` / `{key}.chunking` progress key), exactly matching
the contract the API and client already consume.

### Output contracts (unchanged from the Python service)

- `{key}.chunked.json` — `{ "chunks": [{ page, length_tokens, text, id, type }], "pages": [{ page, text }] }`
- `{key}.parsed.md` — Markdown used for document summarization
- `{key}.parsed.json` — internal page intermediate (`{pages_count, pages:[{page,text}]}`),
  the parse→split handoff; not read by the API/client

## Supported formats

Everything fleischwolf supports: PDF, images, DOCX, PPTX, XLSX, HTML, Markdown,
CSV, AsciiDoc, EPUB, ODF, WebVTT, Email, JATS, USPTO, XBRL, LaTeX, docling-JSON.

The PDF/image path is the full discriminative ML pipeline (pdfium text extraction
+ ONNX layout detection + OCR), matching docling. It requires native libraries and
models at runtime, configured via environment variables (the Docker image bakes
these in):

| Variable | Purpose |
|---|---|
| `PDFIUM_DYNAMIC_LIB_PATH` | directory containing `libpdfium.so` |
| `DOCLING_LAYOUT_ONNX` | RT-DETR layout model (`layout_heron.onnx`) |
| `DOCLING_OCR_REC_ONNX` | PP-OCRv3 recognition model |
| `DOCLING_OCR_DICT` | PP-OCR character dictionary |

`scripts/export_layout.py` (vendored from fleischwolf) exports the layout model;
the `Dockerfile` runs it and downloads pdfium + the OCR model/dict.

## Chunking

Uses the [`chunk`](https://crates.io/crates/chunk) crate: split page text at
sentence boundaries, then token-aware `merge_splits` to a target size
(`CHUNK_SIZE_TOKENS`, default 300, measured with the `o200k_base` / gpt-4o
encoding via `tiktoken-rs`) — reproducing the previous langchain splitter's
behavior.

## Configuration

Environment variables (see `.env.example`). Required: `S3_REGION`, `SQS_REGION`,
`SQS_DOCUMENTS_QUEUE`, `SQS_INDEX_DOCUMENTS_QUEUE`. Static AWS credentials are
used when provided (local/LocalStack); otherwise the default provider chain (ECS
task role). Notable tunables: `NUM_THREADS` (concurrent pollers),
`CHUNK_SIZE_TOKENS`, `SQS_VISIBILITY_TIMEOUT`, `PDF_PAGE_BATCH_SIZE` (PDF batching
threshold; `0` disables), `PARSE_TIMEOUT_SECONDS` (hard cap per parse; a slow/hung
conversion fails the document instead of freezing the worker).

## Run locally

The service needs Redis, S3 and SQS. In dev these are provided by the repo's
`docker-compose` stack (Valkey + LocalStack, with queues/bucket created by
`config/init-localstack.py`).

### Option A — native `cargo run` (fastest iteration)

Good for declarative formats (DOCX/PPTX/XLSX/HTML/MD/CSV/EPUB/…); the PDF/image ML
path is skipped unless you also provide pdfium + the ONNX models (see Option C).

```bash
# 1. start the backing services from the repo root
docker compose up -d redis localstack

# 2. configure the processor (LocalStack endpoints/creds, queues, bucket)
cd document-processor
cp .env.example .env                 # defaults already point at LocalStack on localhost

# 3. run it (from the repo root, or `cargo run` from ./document-processor)
cargo run
# or:  npm run dev:document_processor
```

`GET http://localhost:8080/` returns `{"app":…,"version":…}` once it is up. It then
polls `SQS_DOCUMENTS_QUEUE`; upload a document through the app to drive the
parse → chunk → index flow, and watch progress on the Redis `document:status` channel.

### Option B — full stack via docker-compose (PDF ML included)

Builds the image (pdfium + ONNX models baked in), so PDFs/images work end to end.
The first build is heavy (downloads torch + models).

```bash
docker compose up -d redis localstack
docker compose up --build document-processor
```

### Option C — native run with the PDF ML pipeline

To exercise PDF/image parsing without Docker, run the setup script once. It downloads
pdfium + the OCR model/dict and exports the RT-DETR layout model (into an isolated
`.venv-models`), then prints the env vars to export:

```bash
scripts/pdf_setup.sh
# follow the printed `export …` lines (or add them to .env), then:
cargo run
```

Knobs: `PDFIUM_PLATFORM` (e.g. `linux-arm64`, `mac-x64`), `PYTHON`, `USE_SYSTEM_PYTHON=1`
(skip the venv), `SKIP_LAYOUT=1`. The downloaded `.pdfium/`, `models/` and
`.venv-models/` are all gitignored.

## Develop

```bash
cargo test
cargo clippy --all-targets -- -D warnings
cargo fmt
```

## Build the image

```bash
# from the repo root
docker build -f infrastructure/services/katechat-document-processor/Dockerfile ./
# or, for local compose
docker compose build document-processor
```

## Notes / differences from the Python service

- **Page numbers.** fleischwolf `0.0.1` produces a flat document model with no
  per-element page provenance. To still get real page numbers, PDFs are split into
  single-page documents (`lopdf`) and converted page by page through one reused
  `fleischwolf-pdf` pipeline (a single layout-model load); each page's chunks carry
  its real page number, and `pagesCount` is accurate. Non-PDF formats are a single
  logical page. If a PDF can't be split, it falls back to a one-pass parse (`page: 1`).
- **PDF page-batching (parallel across workers).** PDFs with more than
  `PDF_PAGE_BATCH_SIZE` pages (default 10) are split into part PDFs in S3
  (`{key}.part{n}`) and a `parse_document` command is enqueued per part, so parts are
  parsed **in parallel across workers/instances**; each part's pages are written with
  global page numbers and the parent is reassembled (`parsed.json`/`parsed.md`) once all
  parts finish. Smaller PDFs are parsed in a single message. Set `PDF_PAGE_BATCH_SIZE=0`
  to disable. A single message is still kept alive with a visibility-timeout heartbeat.
