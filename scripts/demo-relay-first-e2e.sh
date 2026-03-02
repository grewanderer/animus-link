#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

RELAY_ADDR="127.0.0.1:17777"
DAEMON_A_API="127.0.0.1:19001"
DAEMON_B_API="127.0.0.1:19002"
ECHO_ADDR="127.0.0.1:19180"
TMP_DIR="/tmp/animus-link-relay-demo-$$"
mkdir -p "${TMP_DIR}"
RELAY_ISSUER_SEED_HEX="9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"
RELAY_ISSUER_PUBKEY_HEX="d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"

PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do
    kill "${pid}" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

wait_http() {
  local addr="$1"
  for _ in $(seq 1 50); do
    if curl -s "http://${addr}/v1/status" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  echo "timed out waiting for daemon at ${addr}" >&2
  return 1
}

start_echo_server() {
  if command -v ncat >/dev/null 2>&1; then
    while true; do ncat -lk "${ECHO_ADDR%:*}" "${ECHO_ADDR#*:}" --sh-exec "cat"; done
    return
  fi
  if command -v nc >/dev/null 2>&1; then
    while true; do nc -l "${ECHO_ADDR%:*}" "${ECHO_ADDR#*:}" -c cat; done
    return
  fi
  echo "missing nc/ncat for demo echo server" >&2
  exit 1
}

cargo run -p relay-server -- \
  --bind "${RELAY_ADDR}" \
  --token-issuer-pubkey-hex "${RELAY_ISSUER_PUBKEY_HEX}" \
  >"${TMP_DIR}/relay.log" 2>&1 &
PIDS+=($!)

cargo run -p link-daemon -- \
  --api-bind "${DAEMON_A_API}" \
  --state-file "${TMP_DIR}/a-namespaces.json" \
  --relay-addr "${RELAY_ADDR}" \
  --relay-name "default-relay" \
  --relay-token-signing-seed-hex "${RELAY_ISSUER_SEED_HEX}" \
  >"${TMP_DIR}/daemon-a.log" 2>&1 &
PIDS+=($!)

cargo run -p link-daemon -- \
  --api-bind "${DAEMON_B_API}" \
  --state-file "${TMP_DIR}/b-namespaces.json" \
  --relay-addr "${RELAY_ADDR}" \
  --relay-name "default-relay" \
  --relay-token-signing-seed-hex "${RELAY_ISSUER_SEED_HEX}" \
  >"${TMP_DIR}/daemon-b.log" 2>&1 &
PIDS+=($!)

wait_http "${DAEMON_A_API}"
wait_http "${DAEMON_B_API}"

start_echo_server >"${TMP_DIR}/echo.log" 2>&1 &
PIDS+=($!)

INVITE_CREATE_JSON="$(curl -s -X POST "http://${DAEMON_A_API}/v1/invite/create")"
INVITE="$(printf '%s' "${INVITE_CREATE_JSON}" | awk -F'"invite":"' '{print $2}' | awk -F'"' '{print $1}')"
if [[ -z "${INVITE}" ]]; then
  echo "failed to parse invite from daemon A response" >&2
  exit 1
fi

curl -s -X POST "http://${DAEMON_B_API}/v1/invite/join" \
  -H "Content-Type: application/json" \
  -d "{\"invite\":\"${INVITE}\"}" >/dev/null

curl -s -X POST "http://${DAEMON_A_API}/v1/expose" \
  -H "Content-Type: application/json" \
  -d "{\"service_name\":\"echo\",\"local_addr\":\"${ECHO_ADDR}\",\"allowed_peers\":[\"peer-b\"]}" \
  >/dev/null

CONNECT_JSON="$(curl -s -X POST "http://${DAEMON_B_API}/v1/connect" \
  -H "Content-Type: application/json" \
  -d "{\"service_name\":\"echo\"}")"

LOCAL_PROXY="$(printf '%s' "${CONNECT_JSON}" | awk -F'"local_addr":"' '{print $2}' | awk -F'"' '{print $1}')"
if [[ -z "${LOCAL_PROXY}" ]]; then
  echo "failed to parse local proxy from connect response" >&2
  exit 1
fi

MESSAGE="relay-first-e2e"
if command -v ncat >/dev/null 2>&1; then
  printf '%s' "${MESSAGE}" | ncat "${LOCAL_PROXY%:*}" "${LOCAL_PROXY#*:}" >"${TMP_DIR}/roundtrip.out"
else
  printf '%s' "${MESSAGE}" | nc "${LOCAL_PROXY%:*}" "${LOCAL_PROXY#*:}" >"${TMP_DIR}/roundtrip.out"
fi

ROUNDTRIP="$(cat "${TMP_DIR}/roundtrip.out")"
if [[ "${ROUNDTRIP}" != "${MESSAGE}" ]]; then
  echo "roundtrip mismatch: expected '${MESSAGE}', got '${ROUNDTRIP}'" >&2
  exit 1
fi

echo "relay-first e2e roundtrip ok (${MESSAGE})"
