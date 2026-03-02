#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
GEN_DIR="${ROOT_DIR}/mobile/ios/Generated"
DIST_DIR="${ROOT_DIR}/mobile/ios/dist"

mkdir -p "${GEN_DIR}" "${DIST_DIR}"

cargo run --quiet -p fabric-ffi --bin generate-bindings -- swift "${GEN_DIR}"

cargo build \
  --manifest-path "${ROOT_DIR}/crates/fabric-ffi/Cargo.toml" \
  --release \
  --target aarch64-apple-ios

cargo build \
  --manifest-path "${ROOT_DIR}/crates/fabric-ffi/Cargo.toml" \
  --release \
  --target aarch64-apple-ios-sim

xcodebuild -create-xcframework \
  -library "${ROOT_DIR}/target/aarch64-apple-ios/release/libfabric_ffi.a" \
  -headers "${GEN_DIR}" \
  -library "${ROOT_DIR}/target/aarch64-apple-ios-sim/release/libfabric_ffi.a" \
  -headers "${GEN_DIR}" \
  -output "${DIST_DIR}/AnimusLinkFFI.xcframework"
