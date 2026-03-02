#!/usr/bin/env bash
set -euo pipefail

echo "==> Bootstrap (tools)"
command -v cargo >/dev/null || { echo "Rust not found"; exit 1; }

echo "==> Build"
cargo build --workspace

echo "==> Test"
cargo test --workspace

echo "OK"
