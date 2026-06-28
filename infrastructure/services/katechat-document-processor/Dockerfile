# syntax=docker/dockerfile:1
#
# KateChat document processor (Rust / fleischwolf) with the full PDF ML pipeline.
#
# Build context is the repository root:
#   docker build -f infrastructure/services/katechat-document-processor/Dockerfile ./
#
# Stages:
#   models  — export the RT-DETR layout model (torch) + fetch OCR model/dict + pdfium
#   builder — compile the Rust binary (ort downloads ONNX Runtime at build time)
#   runtime — slim image with the binary, native libs and models baked in

# ----------------------------------------------------------------------------
# Stage 1: ML models + native libs
# ----------------------------------------------------------------------------
FROM python:3.12-slim AS models

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates tar \
    && rm -rf /var/lib/apt/lists/*

# CPU-only torch is enough to export the layout model to ONNX.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir "transformers>=4.45,<5" "onnx>=1.16,<2"

WORKDIR /build
COPY document-processor/scripts/export_layout.py ./export_layout.py

RUN mkdir -p /opt/models /opt/pdfium \
    # RT-DETR layout model (docling-layout-heron) → ONNX
    && python export_layout.py /opt/models/layout_heron.onnx \
    # PP-OCRv3 recognition model + character dictionary
    && curl -sSL -o /opt/models/ocr_rec.onnx \
        "https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv3/ch_PP-OCRv3_rec_infer.onnx" \
    && curl -sSL -o /opt/models/ppocr_keys_v1.txt \
        "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/ppocr_keys_v1.txt" \
    # pdfium prebuilt shared library (bblanchon) → /opt/pdfium/lib/libpdfium.so
    && curl -sSL -o /tmp/pdfium.tgz \
        "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-linux-x64.tgz" \
    && tar xzf /tmp/pdfium.tgz -C /opt/pdfium \
    && rm /tmp/pdfium.tgz

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

# Dependency layer: build deps against a stub so they cache across source changes.
COPY document-processor/Cargo.toml document-processor/Cargo.lock ./
RUN mkdir src \
    && echo 'fn main() {}' > src/main.rs \
    && cargo build --release --locked \
    && rm -rf src

# Real sources.
COPY document-processor/src ./src
RUN touch src/main.rs && cargo build --release --locked

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
COPY --from=models /opt/models /opt/models
COPY --from=models /opt/pdfium /opt/pdfium

ENV PDFIUM_DYNAMIC_LIB_PATH=/opt/pdfium/lib \
    DOCLING_LAYOUT_ONNX=/opt/models/layout_heron.onnx \
    DOCLING_OCR_REC_ONNX=/opt/models/ocr_rec.onnx \
    DOCLING_OCR_DICT=/opt/models/ppocr_keys_v1.txt \
    LD_LIBRARY_PATH=/usr/local/lib:/opt/pdfium/lib \
    PORT=8080

EXPOSE 8080

CMD ["katechat-document-processor"]
