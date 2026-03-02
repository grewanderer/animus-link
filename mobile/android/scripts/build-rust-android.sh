#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/mobile/android/app/src/main/jniLibs"
KOTLIN_BINDINGS_DIR="${ROOT_DIR}/mobile/android/app/src/main/kotlin"

mkdir -p "${OUTPUT_DIR}"
mkdir -p "${KOTLIN_BINDINGS_DIR}"

cargo run --quiet -p fabric-ffi --bin generate-bindings -- kotlin "${KOTLIN_BINDINGS_DIR}"
cargo ndk \
  -t arm64-v8a \
  -t x86_64 \
  -o "${OUTPUT_DIR}" \
  build -p fabric-ffi --release
