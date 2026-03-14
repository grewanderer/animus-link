#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <target-triple> <profile>"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_TRIPLE="$1"
PROFILE="$2"

case "${TARGET_TRIPLE}" in
  *windows*)
    BIN_NAME="link-daemon.exe"
    SIDECAR_NAME="link-daemon-${TARGET_TRIPLE}.exe"
    ;;
  *)
    BIN_NAME="link-daemon"
    SIDECAR_NAME="link-daemon-${TARGET_TRIPLE}"
    ;;
esac

SOURCE_BIN="${ROOT_DIR}/target/${PROFILE}/${BIN_NAME}"
DEST_DIR="${ROOT_DIR}/apps/link-desktop/src-tauri/bin"
DEST_BIN="${DEST_DIR}/${SIDECAR_NAME}"

if [[ ! -f "${SOURCE_BIN}" ]]; then
  echo "missing daemon binary: ${SOURCE_BIN}"
  exit 1
fi

mkdir -p "${DEST_DIR}"
cp "${SOURCE_BIN}" "${DEST_BIN}"
chmod +x "${DEST_BIN}" || true
echo "[prepare-desktop-sidecar] copied ${SOURCE_BIN} -> ${DEST_BIN}"
