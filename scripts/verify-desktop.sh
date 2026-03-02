#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

RELAY_ADDR="${ANIMUS_VERIFY_RELAY_ADDR:-127.0.0.1:17777}"
API_ADDR="${ANIMUS_VERIFY_API_ADDR:-127.0.0.1:19999}"
STATE_FILE="${ANIMUS_VERIFY_STATE_FILE:-/tmp/animus-link-verify-state.json}"

# Ed25519 test vector keypair; for local smoke only.
ISSUER_PUB_HEX="${ANIMUS_VERIFY_ISSUER_PUBKEY_HEX:-d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a}"
ISSUER_SEED_HEX="${ANIMUS_VERIFY_ISSUER_SEED_HEX:-9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60}"

RELAY_PID=""
DAEMON_PID=""

cleanup() {
  if [[ -n "${DAEMON_PID}" ]]; then
    kill "${DAEMON_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${RELAY_PID}" ]]; then
    kill "${RELAY_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "[verify-desktop] build workspace"
cargo build --workspace

echo "[verify-desktop] start relay-server (signed tokens required)"
cargo run -p relay-server -- \
  --bind "${RELAY_ADDR}" \
  --relay-name "default-relay" \
  --token-issuer-pubkey-hex "${ISSUER_PUB_HEX}" \
  >/tmp/animus-verify-relay.log 2>&1 &
RELAY_PID="$!"

echo "[verify-desktop] start link-daemon"
cargo run -p link-daemon -- \
  --api-bind "${API_ADDR}" \
  --state-file "${STATE_FILE}" \
  --relay-addr "${RELAY_ADDR}" \
  --relay-name "default-relay" \
  --relay-token-signing-seed-hex "${ISSUER_SEED_HEX}" \
  >/tmp/animus-verify-daemon.log 2>&1 &
DAEMON_PID="$!"

echo "[verify-desktop] wait for API readiness"
for _ in $(seq 1 30); do
  if curl -fsS "http://${API_ADDR}/v1/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

echo "[verify-desktop] API smoke checks"
curl -fsS "http://${API_ADDR}/v1/health" | awk '/"ok":true/'
curl -fsS "http://${API_ADDR}/v1/self_check" | awk '/"api_version":"v1"/ && /"checks"/'
curl -fsS "http://${API_ADDR}/v1/diagnostics" | awk '/"api_version":"v1"/ && /"config_summary"/'
curl -fsS "http://${API_ADDR}/v1/metrics" | awk '/connect_attempts_total|expose_attempts_total/'

echo "[verify-desktop] PASS"
