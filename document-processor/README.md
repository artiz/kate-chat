# KateChat Document Processor (Rust)

SQS-driven RAG ingestion service. It converts uploaded documents to Markdown +
chunks for embedding, reporting progress over Redis. This is the Rust replacement
for the previous Python service (archived under `../document-processor-python/`),
built on [**docling.rs**](https://github.com/docling-project/docling.rs) (the `docling` crate, formerly `fleischwolf`) — a Rust port of
[docling](https://github.com/docling-project/docling).

## Pipeline

```
SQS documents-queue
  ├─ parse_document → docling convert → S3 {key}.parsed.json (docling JSON, internal)
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

Everything docling.rs supports: PDF, images, DOCX, PPTX, XLSX, HTML, Markdown,
CSV, AsciiDoc, EPUB, ODF, WebVTT, Email, JATS, USPTO, XBRL, LaTeX, docling-JSON.

The PDF/image path is the full discriminative ML pipeline (pdfium text extraction
+ ONNX layout detection + OCR), matching docling. It requires native libraries and
models at runtime, configured via environment variables (the Docker image bakes
these in):

| Variable | Purpose |
|---|---|
| `PDFIUM_DYNAMIC_LIB_PATH` | directory containing `libpdfium.so` |
| `DOCLING_RS_EP` | ONNX execution provider: `cpu`, `cuda`, `auto` (the image default — use the GPU when present, fall back to CPU), … An explicitly requested accelerator that cannot initialize fails loudly instead of silently degrading |
| `DOCLING_LAYOUT_ONNX` / `DOCLING_OCR_{REC_ONNX,DICT}` / `DOCLING_TABLEFORMER_{ENCODER,DECODER,BBOX}` | optional explicit model overrides. The image does not pin them: models resolve via `/usr/local/models` and the pipeline picks the right variant at runtime — INT8 layout on CPU (~2.4× faster at unchanged conformance), fp32 on GPU (the int8 QDQ graphs are CPU-calibrated), and the hoisted-KV TableFormer decoder (`decoder_kv.onnx`) over the legacy graphs |

The `Dockerfile` (mirroring docling.rs's `examples/Dockerfile` stage layout)
fetches the prebuilt optimized model exports and pdfium from docling.rs's
GitHub Release via its `download_dependencies.sh`: fp32 + INT8 layout, the
hoisted-KV TableFormer decoder, PP-OCRv3 and the picture classifier. Whisper
ASR and the hybrid-chunker tokenizer are skipped (`--no-asr --no-chunk`) —
this service ingests no audio and chunks with its own tokenizer. `--build-arg
TARGET_CPU=x86-64-v3` (or `native`) lets the compiler use AVX2+ in the
image-processing hot paths; the default stays portable x86-64.

### GPU

The binary is built with docling.rs's **CUDA execution provider** compiled in
(`docling` cargo feature `cuda`) and the image defaults to `DOCLING_RS_EP=auto`:
every compiled-in provider is registered in performance order and ONNX Runtime
falls back to CPU when no usable GPU is present — one image serves mixed
fleets. On a CPU-only host nothing changes vs the previous build (the INT8
models keep the fast path). To actually run on a GPU:

1. rebuild the runtime on a cuDNN base:
   `--build-arg RUNTIME_BASE=nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04`
2. run with the NVIDIA container runtime (`--gpus all` / ECS GPU task)
3. optionally set `DOCLING_RS_EP=cuda` to fail loudly if the GPU cannot
   initialize instead of silently degrading to CPU

With a GPU provider selected the pipeline automatically switches the layout
model to the fp32 export — the INT8 graphs are CPU-calibrated and were never
conformance-validated on GPU.

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
The first build downloads the prebuilt models (~350 MB) and compiles the Rust
binary; no torch export anymore.

```bash
docker compose up -d redis localstack
docker compose up --build document-processor
```

### Option C — native run with the PDF ML pipeline

To exercise PDF/image parsing without Docker, fetch the prebuilt models + pdfium
once with docling.rs's install script (run from `document-processor/`):

```bash
curl -fsSL https://raw.githubusercontent.com/docling-project/docling.rs/v0.42.1/scripts/install/download_dependencies.sh \
  | sh -s -- --no-asr --no-chunk
cargo run
```

No env vars needed: both the conversion pipeline and the PDF splitter resolve
`.pdfium/lib` and `models/` relative to the working directory. The script is
idempotent and keeps files already on disk — after a docling.rs upgrade re-run
it with `--force`, or a stale mix breaks model pairing (e.g. the hoisted-KV
TableFormer decoder needs the matching encoder that emits the `cross_kt_*`
tensors; on a mismatch the pipeline falls back to geometric tables). pdfium is hosted
for Linux x64; for other platforms (or to rebuild the models from source) see
docling.rs's `scripts/install/pdf_setup.sh`. The downloaded `.pdfium/` and
`models/` are gitignored.

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

- **Strict Markdown.** Conversion runs with docling.rs's `strict` mode (a
  Rust-only switch): cleaner, more conformant Markdown than docling's legacy
  export — code-fence languages preserved, no `\_` escaping, no inline-run
  spacing artifacts — and hyperlinks recovered from PDFs are inlined as
  `[text](url)`. Better chunk text for embedding and citation.

- **Page numbers.** docling.rs produces a flat document model
  with no per-element page provenance. To still get real page numbers, PDFs are
  converted through `docling-pdf`'s **streaming** pipeline
  (`Pipeline::convert_streaming`), which emits each page's finalized nodes in
  document order — one batch per page — while inference fans out across the
  pipeline's internal worker pool (PDFs with ≥ `DOCLING_RS_PDF_PARALLEL_MIN`
  pages, default 6; pool size via `DOCLING_RS_PDF_WORKERS`). Each page's chunks
  carry its real page number, and `pagesCount` is accurate. A block spanning a
  page boundary (a paragraph/list continuing onto the next page) is emitted whole
  with the page it finishes on. Non-PDF formats are a single logical page.
- **PDF page-batching (parallel across workers).** PDFs with more than
  `PDF_PAGE_BATCH_SIZE` pages (default 10) are split into part PDFs in S3
  (`{key}.part{n}`) and a `parse_document` command is enqueued per part, so parts are
  parsed **in parallel across workers/instances**; each part's pages are written with
  global page numbers and the parent is reassembled (`parsed.json`/`parsed.md`) once all
  parts finish. Smaller PDFs are parsed in a single message. Set `PDF_PAGE_BATCH_SIZE=0`
  to disable. A single message is still kept alive with a visibility-timeout heartbeat.

- **Warm pipeline pool & tuning.** `docling-pdf` loads its ONNX models lazily
  **per `Pipeline` instance** (a multi-page document spins up an internal pool of
  up to 4 model copies, ~0.4 GB each), so the service keeps finished pipelines in
  a process-wide pool and reuses them across documents — only the first parses
  pay the model load; the pool grows to at most the number of concurrent parses
  (the SQS worker count), and those warm pipelines hold their models in memory
  for the lifetime of the process. Since page-batching already parallelizes
  across SQS workers, the pipeline-internal fan-out mostly overlaps with it: on
  memory-constrained instances (or when many workers parse concurrently) set
  `DOCLING_RS_PDF_WORKERS=1` — SQS-level parallelism stays, each pipeline keeps a
  single model copy, and with ~10-page parts the internal pool had little time to
  pay off anyway. `DOCLING_RS_PDF_INTRA` (ONNX intra-op threads per worker,
  default 2) is the other knob for per-machine tuning.
