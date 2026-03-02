#!/usr/bin/env bash
set -euo pipefail

echo "[launch-verify] 1/5 cargo fmt --all -- --check"
cargo fmt --all -- --check

echo "[launch-verify] 2/5 cargo clippy --workspace --all-targets -- -D warnings"
cargo clippy --workspace --all-targets -- -D warnings

echo "[launch-verify] 3/5 cargo test --workspace"
cargo test --workspace

echo "[launch-verify] 4/5 conformance"
cargo run -p conformance-runner -- --run all

echo "[launch-verify] 5/5 relay-first signed-token e2e gate"
cargo test -p link-daemon api::tests::relay_first_expose_connect_roundtrip_bytes -- --nocapture

echo "[launch-verify] PASS: fmt + clippy + tests + conformance + relay-first e2e"
