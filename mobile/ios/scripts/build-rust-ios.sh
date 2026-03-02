#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
GEN_DIR="${ROOT_DIR}/mobile/ios/Generated"

mkdir -p "${GEN_DIR}"

cargo run --quiet -p fabric-ffi --bin generate-bindings -- swift "${GEN_DIR}"

TARGET_TRIPLE="aarch64-apple-ios"
PLATFORM_DIR="iphoneos"

if [[ "${PLATFORM_NAME:-iphoneos}" == "iphonesimulator" ]]; then
  TARGET_TRIPLE="aarch64-apple-ios-sim"
  PLATFORM_DIR="iphonesimulator"
fi

cargo build \
  --manifest-path "${ROOT_DIR}/crates/fabric-ffi/Cargo.toml" \
  --release \
  --target "${TARGET_TRIPLE}"

mkdir -p "${ROOT_DIR}/mobile/ios/RustLibs/${PLATFORM_DIR}"
cp \
  "${ROOT_DIR}/target/${TARGET_TRIPLE}/release/libfabric_ffi.a" \
  "${ROOT_DIR}/mobile/ios/RustLibs/${PLATFORM_DIR}/libfabric_ffi.a"
