#!/usr/bin/env bash
# Fetch the native libs + ONNX models the PDF/image pipeline needs for a local
# (non-Docker) run of the document processor. All outputs are gitignored.
#
# Adapted from https://github.com/artiz/fleischwolf (scripts/pdf_setup.sh).
#
# Usage (from document-processor/ or anywhere — paths are resolved relative to
# this script):
#
#   scripts/pdf_setup.sh
#
# Downloads:
#   - libpdfium (bblanchon prebuilt)  -> .pdfium/lib/libpdfium.so
#   - PP-OCRv3 recognition model      -> models/ocr_rec.onnx
#   - PP-OCR character dictionary     -> models/ppocr_keys_v1.txt
# And exports the RT-DETR layout model -> models/layout_heron.onnx
#   (torch+transformers+onnx, installed into an isolated .venv-models by default).
# Optionally (WITH_TABLEFORMER=1) exports the TableFormer table-structure models
#   -> models/tableformer/{encoder,decoder,bbox}.onnx (else geometric fallback).
#
# Knobs (env vars):
#   PDFIUM_PLATFORM=linux-x64   pdfium release to fetch (e.g. linux-arm64, mac-x64)
#   PYTHON=python3              interpreter used to create the export venv
#   USE_SYSTEM_PYTHON=1         run the export scripts with $PYTHON directly (no venv)
#   SKIP_LAYOUT=1               skip the layout model (PDF/image parsing will fail)
#   WITH_TABLEFORMER=1          also export TableFormer (heavy: docling-ibm-models
#                               + the docling checkpoint); off by default
set -euo pipefail
cd "$(dirname "$0")/.."   # document-processor/

PLATFORM="${PDFIUM_PLATFORM:-linux-x64}"
PYTHON="${PYTHON:-python3}"
ROOT="$(pwd)"
mkdir -p .pdfium models

# 1) pdfium prebuilt shared library
if [ ! -f .pdfium/lib/libpdfium.so ]; then
  echo "→ libpdfium ($PLATFORM)"
  curl -sSL -o /tmp/pdfium.tgz \
    "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-${PLATFORM}.tgz"
  tar xzf /tmp/pdfium.tgz -C .pdfium
  rm -f /tmp/pdfium.tgz
else
  echo "✓ libpdfium already present"
fi

# 2) PP-OCRv3 recognition model
if [ ! -f models/ocr_rec.onnx ]; then
  echo "→ PP-OCRv3 recognition model"
  curl -sSL -o models/ocr_rec.onnx \
    "https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv3/ch_PP-OCRv3_rec_infer.onnx"
else
  echo "✓ ocr_rec.onnx already present"
fi

# 3) PP-OCR character dictionary
if [ ! -f models/ppocr_keys_v1.txt ]; then
  echo "→ PP-OCR dictionary"
  curl -sSL -o models/ppocr_keys_v1.txt \
    "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/ppocr_keys_v1.txt"
else
  echo "✓ ppocr_keys_v1.txt already present"
fi

# 4) RT-DETR layout model (exported from torch)
if [ -f models/layout_heron.onnx ]; then
  echo "✓ layout_heron.onnx already present"
elif [ "${SKIP_LAYOUT:-0}" = "1" ]; then
  echo "! skipping layout model (SKIP_LAYOUT=1) — PDF/image parsing will fail without it"
elif [ "${USE_SYSTEM_PYTHON:-0}" = "1" ]; then
  echo "→ exporting RT-DETR layout model with $PYTHON (expects torch+transformers+onnx)"
  "$PYTHON" scripts/export_layout.py models/layout_heron.onnx
else
  echo "→ exporting RT-DETR layout model (torch+transformers+onnx in .venv-models)"
  VENV=".venv-models"
  if [ ! -d "$VENV" ]; then
    echo "  creating $VENV and installing torch (cpu) + transformers + onnx ..."
    "$PYTHON" -m venv "$VENV"
    "$VENV/bin/pip" install --quiet --upgrade pip
    "$VENV/bin/pip" install --quiet torch --index-url https://download.pytorch.org/whl/cpu
    "$VENV/bin/pip" install --quiet "transformers>=4.45" onnx
  fi
  "$VENV/bin/python" scripts/export_layout.py models/layout_heron.onnx
fi

# 5) TableFormer table-structure models (optional — fleischwolf falls back to
#    geometric reconstruction without them). Heavy: needs docling-ibm-models and
#    the docling checkpoint, so it is opt-in via WITH_TABLEFORMER=1.
if [ "${WITH_TABLEFORMER:-0}" != "1" ]; then
  echo "○ skipping TableFormer (set WITH_TABLEFORMER=1 to export; geometric fallback otherwise)"
elif [ -f models/tableformer/encoder.onnx ] && [ -f models/tableformer/decoder.onnx ] \
  && [ -f models/tableformer/bbox.onnx ]; then
  echo "✓ tableformer models already present"
else
  TF_PKGS="transformers>=4.45 onnx docling-ibm-models[opencv-python-headless] onnxscript onnxruntime huggingface_hub"
  CKPT='from huggingface_hub import snapshot_download as d; print(d("docling-project/docling-models", allow_patterns=["model_artifacts/tableformer/accurate/*"]))'
  if [ "${USE_SYSTEM_PYTHON:-0}" = "1" ]; then
    echo "→ exporting TableFormer with $PYTHON (expects $TF_PKGS)"
    ACC="$("$PYTHON" -c "$CKPT")/model_artifacts/tableformer/accurate"
    "$PYTHON" scripts/export_tableformer.py "$ACC" models/tableformer
  else
    echo "→ exporting TableFormer models (docling-ibm-models + checkpoint in .venv-models)"
    VENV=".venv-models"
    if [ ! -d "$VENV" ]; then
      "$PYTHON" -m venv "$VENV"
      "$VENV/bin/pip" install --quiet --upgrade pip
      "$VENV/bin/pip" install --quiet torch --index-url https://download.pytorch.org/whl/cpu
    fi
    # shellcheck disable=SC2086
    "$VENV/bin/pip" install --quiet --extra-index-url https://download.pytorch.org/whl/cpu $TF_PKGS
    ACC="$("$VENV/bin/python" -c "$CKPT")/model_artifacts/tableformer/accurate"
    "$VENV/bin/python" scripts/export_tableformer.py "$ACC" models/tableformer
  fi
fi

cat <<EOF

done. export these before \`cargo run\` (or add them to document-processor/.env):

  export PDFIUM_DYNAMIC_LIB_PATH=$ROOT/.pdfium/lib
  export DOCLING_LAYOUT_ONNX=$ROOT/models/layout_heron.onnx
  export DOCLING_OCR_REC_ONNX=$ROOT/models/ocr_rec.onnx
  export DOCLING_OCR_DICT=$ROOT/models/ppocr_keys_v1.txt
EOF

if [ -f models/tableformer/encoder.onnx ]; then
  cat <<EOF
  export DOCLING_TABLEFORMER_ENCODER=$ROOT/models/tableformer/encoder.onnx
  export DOCLING_TABLEFORMER_DECODER=$ROOT/models/tableformer/decoder.onnx
  export DOCLING_TABLEFORMER_BBOX=$ROOT/models/tableformer/bbox.onnx
EOF
fi
