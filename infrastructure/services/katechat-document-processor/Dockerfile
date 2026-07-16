# syntax=docker/dockerfile:1
#
# KateChat document processor (Rust / docling.rs) with the full PDF ML pipeline.
#
# Build context is the repository root:
#   docker build -f infrastructure/services/katechat-document-processor/Dockerfile ./
#
# Stages mirror docling.rs's examples/Dockerfile (models/builder/runtime), but
# the models stage fetches the prebuilt optimized exports from the docling.rs
# models release instead of re-exporting them with torch:
#   models  — pdfium + ONNX models: RT-DETR layout (fp32 + INT8), TableFormer
#             with the hoisted-KV decoder (decoder_kv.onnx — the fastest
#             measured variant, byte-exact vs docling), PP-OCRv3, picture
#             classifier
#   builder — compile the Rust binary (ort downloads ONNX Runtime at build time)
#   runtime — slim image with the binary, native libs and models baked in

# ----------------------------------------------------------------------------
# Stage 1: ML models + native libs
# ----------------------------------------------------------------------------
FROM debian:trixie-slim AS models

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates tar \
    && rm -rf /var/lib/apt/lists/*

# docling.rs hosts ready-made model exports + pdfium in its GitHub Release
# (models-v1); download_dependencies.sh (pinned to the docling.rs version in
# Cargo.toml) fetches everything into ./models and ./.pdfium.
# --no-asr skips the Whisper audio models (this service ingests no audio) and
# --no-chunk the hybrid-chunker tokenizer (chunking runs on our own tokenizer).
WORKDIR /opt/docling
RUN curl -fsSL https://raw.githubusercontent.com/docling-project/docling.rs/v0.40.3/scripts/install/download_dependencies.sh \
        | sh -s -- --no-asr --no-chunk \
    # The runtime pins the INT8 layout and the hoisted-KV TableFormer decoder;
    # both are optional for the script, so fail the build loudly if the
    # release stops hosting them.
    && test -f models/layout_heron_int8.onnx \
    && test -f models/tableformer/decoder_kv.onnx

# INT8=1 (default): the runtime env points DOCLING_LAYOUT_ONNX at this symlink —
# INT8-quantized layout (~2.4x faster inference at validated-unchanged
# conformance), fp32 with --build-arg INT8=0. Both precisions ship in the image
# either way, so a container can pin one explicitly, e.g.
# -e DOCLING_LAYOUT_ONNX=/opt/models/layout_heron.onnx
ARG INT8=1
RUN if [ "$INT8" = "1" ]; then \
        ln -s layout_heron_int8.onnx models/layout_heron_active.onnx; \
    else \
        ln -s layout_heron.onnx models/layout_heron_active.onnx; \
    fi

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

# TARGET_CPU: empty (default) = portable x86-64 image; "x86-64-v3" = require
# AVX2 (most cloud fleets); "native" = tune for the build host. Affects the
# Rust-side image-processing hot paths; ONNX Runtime ships its own runtime CPU
# dispatch either way.
ARG TARGET_CPU=""
ENV CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1

# Dependency layer: build deps against a stub so they cache across source changes.
COPY document-processor/Cargo.toml document-processor/Cargo.lock ./
RUN mkdir src \
    && echo 'fn main() {}' > src/main.rs \
    && if [ -n "$TARGET_CPU" ]; then export RUSTFLAGS="-C target-cpu=$TARGET_CPU"; fi \
    && cargo build --release --locked \
    && rm -rf src

# Real sources.
COPY document-processor/src ./src
RUN touch src/main.rs \
    && if [ -n "$TARGET_CPU" ]; then export RUSTFLAGS="-C target-cpu=$TARGET_CPU"; fi \
    && cargo build --release --locked

# Collect the binary (must exist) plus the ONNX Runtime shared lib (only present
# when ort links dynamically — best-effort).
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

# Binary + (optional) ONNX Runtime shared lib.
COPY --from=builder /artifacts/ /tmp/artifacts/
RUN cp /tmp/artifacts/katechat-document-processor /usr/local/bin/ \
    && (cp /tmp/artifacts/libonnxruntime*.so* /usr/local/lib/ 2>/dev/null || true) \
    && rm -rf /tmp/artifacts \
    && ldconfig

# Models + pdfium.
COPY --from=models /opt/docling/models /opt/models
COPY --from=models /opt/docling/.pdfium/lib /opt/pdfium/lib
# The picture classifier has no env override — it resolves models/… relative to
# the binary's dir or its parent; the binary lives in /usr/local/bin, so this
# symlink makes /opt/models visible from any working directory.
RUN ln -s /opt/models /usr/local/models

# The pipeline finds its native lib + models via these env vars:
#   * layout_heron_active.onnx is the symlink resolved by the models stage's
#     INT8 arg (int8 by default, fp32 with --build-arg INT8=0)
#   * the TableFormer decoder is pinned to the hoisted-KV fp32 graph
#     (decoder_kv.onnx); -e DOCLING_TABLEFORMER_DECODER=/opt/models/tableformer/decoder.onnx
#     switches to the legacy graph (both are auto-detected by input names)
ENV PDFIUM_DYNAMIC_LIB_PATH=/opt/pdfium/lib \
    DOCLING_LAYOUT_ONNX=/opt/models/layout_heron_active.onnx \
    DOCLING_OCR_REC_ONNX=/opt/models/ocr_rec.onnx \
    DOCLING_OCR_DICT=/opt/models/ppocr_keys_v1.txt \
    DOCLING_TABLEFORMER_ENCODER=/opt/models/tableformer/encoder.onnx \
    DOCLING_TABLEFORMER_DECODER=/opt/models/tableformer/decoder_kv.onnx \
    DOCLING_TABLEFORMER_BBOX=/opt/models/tableformer/bbox.onnx \
    LD_LIBRARY_PATH=/usr/local/lib:/opt/pdfium/lib \
    PORT=8080

EXPOSE 8080

CMD ["katechat-document-processor"]
