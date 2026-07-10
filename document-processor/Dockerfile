# syntax=docker/dockerfile:1
#
# KateChat document processor (Rust / docling.rs) with the full PDF ML pipeline.
# Used by docker-compose for local development. Build context is the repo root.
#
# This mirrors infrastructure/services/katechat-document-processor/Dockerfile.
#
# Stages:
#   models  — fetch pdfium + the ONNX models (fp32 + INT8) from docling.rs's
#             GitHub Release via download_dependencies.sh (no torch export)
#   builder — compile the Rust binary (ort downloads ONNX Runtime at build time)
#   runtime — slim image with the binary, native libs and models baked in

# ----------------------------------------------------------------------------
# Stage 1: ML models + native libs
# ----------------------------------------------------------------------------
FROM debian:trixie-slim AS models

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# docling.rs hosts ready-made model exports + pdfium in its GitHub Release
# (tag models-v1): RT-DETR layout, TableFormer, PP-OCRv3 — plus the
# INT8-quantized layout detector and TableFormer decoder (~2.4× faster layout
# inference on CPU at validated-unchanged conformance; see docling.rs's
# PDF_PERFORMANCE.md). download_dependencies.sh (pinned to the docling.rs
# version in Cargo.toml) fetches everything into ./models and ./.pdfium.
# --no-asr skips the Whisper audio models — this service doesn't ingest audio.
WORKDIR /opt/docling
RUN curl -fsSL https://raw.githubusercontent.com/docling-project/docling.rs/v0.30.0/scripts/install/download_dependencies.sh \
        | sh -s -- --no-asr \
    # The runtime pins the pipeline to the INT8 models; they are optional for
    # the script, so fail the build loudly if the release stops hosting them.
    && test -f models/layout_heron_int8.onnx \
    && test -f models/tableformer/decoder_int8.onnx

# ----------------------------------------------------------------------------
# Stage 2: Rust build
# ----------------------------------------------------------------------------
FROM rust:1-slim-trixie AS builder

# build-essential / cmake / perl cover the C/C++/asm builds of aws-lc-sys
# (rustls crypto) and ort-sys.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential cmake perl pkg-config ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY document-processor/Cargo.toml document-processor/Cargo.lock ./
RUN mkdir src \
    && echo 'fn main() {}' > src/main.rs \
    && cargo build --release --locked \
    && rm -rf src

COPY document-processor/src ./src
RUN touch src/main.rs && cargo build --release --locked

RUN mkdir -p /artifacts && cp target/release/katechat-document-processor /artifacts/
RUN find target -name 'libonnxruntime*.so*' -exec cp -av {} /artifacts/ \; || true

# ----------------------------------------------------------------------------
# Stage 3: runtime
# ----------------------------------------------------------------------------
FROM debian:trixie-slim AS runtime

ARG COMMIT_SHA=""
ENV COMMIT_SHA=$COMMIT_SHA

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libstdc++6 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /artifacts/ /tmp/artifacts/
RUN cp /tmp/artifacts/katechat-document-processor /usr/local/bin/ \
    && (cp /tmp/artifacts/libonnxruntime*.so* /usr/local/lib/ 2>/dev/null || true) \
    && rm -rf /tmp/artifacts \
    && ldconfig

COPY --from=models /opt/docling/models /opt/models
COPY --from=models /opt/docling/.pdfium/lib /opt/pdfium/lib

# Layout + TableFormer decoder point at the INT8 models (both precisions are
# baked in, so a container can pin fp32 explicitly, e.g.
# -e DOCLING_LAYOUT_ONNX=/opt/models/layout_heron.onnx
# -e DOCLING_TABLEFORMER_DECODER=/opt/models/tableformer/decoder.onnx).
ENV PDFIUM_DYNAMIC_LIB_PATH=/opt/pdfium/lib \
    DOCLING_LAYOUT_ONNX=/opt/models/layout_heron_int8.onnx \
    DOCLING_OCR_REC_ONNX=/opt/models/ocr_rec.onnx \
    DOCLING_OCR_DICT=/opt/models/ppocr_keys_v1.txt \
    DOCLING_TABLEFORMER_ENCODER=/opt/models/tableformer/encoder.onnx \
    DOCLING_TABLEFORMER_DECODER=/opt/models/tableformer/decoder_int8.onnx \
    DOCLING_TABLEFORMER_BBOX=/opt/models/tableformer/bbox.onnx \
    LD_LIBRARY_PATH=/usr/local/lib:/opt/pdfium/lib \
    PORT=8080

EXPOSE 8080

CMD ["katechat-document-processor"]
