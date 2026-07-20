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

# RUNTIME_BASE: debian-slim by default (CPU anywhere, the CUDA EP degrades to
# CPU with a warning under DOCLING_RS_EP=auto). For GPU fleets rebase the
# runtime onto a cuDNN image, e.g.
#   --build-arg RUNTIME_BASE=nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04
# and run with the NVIDIA container runtime.
ARG RUNTIME_BASE=debian:trixie-slim

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
RUN curl -fsSL https://raw.githubusercontent.com/docling-project/docling.rs/v0.42.1/scripts/install/download_dependencies.sh \
        | sh -s -- --no-asr --no-chunk \
    # The hoisted-KV TableFormer decoder is required (fail loudly if the
    # release stops hosting it); the INT8 layout is best-effort — since the
    # GPU-era release refresh it may be absent, and the runtime then uses the
    # fp32 layout on CPU too (quantize locally with
    # scripts/install/quantize_models.py to restore the int8 CPU fast path).
    && test -f models/tableformer/decoder_kv.onnx \
    && (test -f models/layout_heron_int8.onnx \
        || echo "NOTE: layout_heron_int8.onnx not hosted — fp32 layout will be used on CPU")

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

# Collect the binary (must exist) plus the ONNX Runtime shared libs. The GPU
# execution providers are separate dlopen plugins ort materializes as SYMLINKS
# into its download cache (copy-dylibs) — dereference with -L or the runtime
# stage ends up with dangling links and silently loses the CUDA provider.
RUN mkdir -p /artifacts && cp target/release/katechat-document-processor /artifacts/
RUN find target -name 'libonnxruntime*.so*' -exec cp -Lv {} /artifacts/ \; || true

# ----------------------------------------------------------------------------
# Stage 3: runtime
# ----------------------------------------------------------------------------
FROM ${RUNTIME_BASE} AS runtime

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

# GPU: the binary is built with the CUDA execution provider compiled in;
# DOCLING_RS_EP=auto registers every compiled-in provider and ONNX Runtime
# falls back to CPU when no usable GPU is present. Set DOCLING_RS_EP=cuda to
# fail loudly instead of degrading, or =cpu to opt out.
#
# Model paths are deliberately NOT pinned: the pipeline resolves models/…
# via the /usr/local/models symlink and picks the right precision at runtime —
# the INT8 exports on CPU (~2.4x faster layout at unchanged conformance), the
# fp32 exports when a GPU provider is selected (the int8 QDQ graphs are
# CPU-calibrated), and the hoisted-KV TableFormer decoder over the legacy
# graphs. DOCLING_LAYOUT_ONNX / DOCLING_TABLEFORMER_* / DOCLING_OCR_* remain
# available as explicit overrides.
ENV PDFIUM_DYNAMIC_LIB_PATH=/opt/pdfium/lib \
    DOCLING_RS_EP=auto \
    LD_LIBRARY_PATH=/usr/local/lib:/opt/pdfium/lib \
    PORT=8080

EXPOSE 8080

CMD ["katechat-document-processor"]
