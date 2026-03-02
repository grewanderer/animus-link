#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PRODUCTS_DIR="${ROOT_DIR}/mobile/ios/build/Build/Products/Debug-iphoneos"
APP_PATH="${PRODUCTS_DIR}/AnimusLinkIOS.app"
PAYLOAD_DIR="${PRODUCTS_DIR}/Payload"
IPA_PATH="${PRODUCTS_DIR}/AnimusLinkIOS-debug.ipa"

test -d "${APP_PATH}"
rm -rf "${PAYLOAD_DIR}" "${IPA_PATH}"
mkdir -p "${PAYLOAD_DIR}"
cp -R "${APP_PATH}" "${PAYLOAD_DIR}/"

(
  cd "${PRODUCTS_DIR}"
  zip -q -r "${IPA_PATH}" Payload
)

test -f "${IPA_PATH}"
