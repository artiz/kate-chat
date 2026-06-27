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
- `{key}.parsed.json` — docling-native `DoclingDocument` JSON; internal to this service

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
`CHUNK_SIZE_TOKENS`, `SQS_VISIBILITY_TIMEOUT`.

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

To exercise PDF/image parsing without Docker, fetch the native libs/models once and
point the env vars at them, then `cargo run`:

```bash
# pdfium
mkdir -p .pdfium && curl -sSL \
  https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-linux-x64.tgz \
  | tar xz -C .pdfium
# OCR model + dictionary
mkdir -p models
curl -sSL -o models/ocr_rec.onnx \
  https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv3/ch_PP-OCRv3_rec_infer.onnx
curl -sSL -o models/ppocr_keys_v1.txt \
  https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/ppocr_keys_v1.txt
# layout model (needs python + torch/transformers/onnx)
pip install torch transformers onnx && python scripts/export_layout.py models/layout_heron.onnx

export PDFIUM_DYNAMIC_LIB_PATH=$PWD/.pdfium/lib
export DOCLING_LAYOUT_ONNX=$PWD/models/layout_heron.onnx
export DOCLING_OCR_REC_ONNX=$PWD/models/ocr_rec.onnx
export DOCLING_OCR_DICT=$PWD/models/ppocr_keys_v1.txt
cargo run
```

(`.pdfium/` and `models/` are gitignored.)

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

- **Single-pass processing.** The Python service split large PDFs into page
  batches (a docling performance workaround) via several SQS round-trips. The
  Rust service converts each document in one pass and keeps the SQS message alive
  with a visibility-timeout heartbeat. The page-batching command fields
  (`parentS3Key`/`part`/`partsCount`) are still accepted for compatibility.
- **Page numbers.** fleischwolf `0.0.1` produces a flat document model without
  per-element page provenance, so chunks are currently tagged `page: 1`. When
  fleischwolf exposes provenance, the chunker can populate real page numbers.
