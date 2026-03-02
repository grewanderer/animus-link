#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-${ROOT_DIR}/dist}"

if [[ ! -d "${DIST_DIR}" ]]; then
  echo "[verify-release-artifacts] error: dist directory not found: ${DIST_DIR}" >&2
  exit 2
fi

cd "${DIST_DIR}"

echo "[verify-release-artifacts] checking required integrity files"
test -f SHA256SUMS.txt
test -f sbom.cdx.json

echo "[verify-release-artifacts] validating SHA256SUMS format"
awk '
  NF != 2 { bad=1; next }
  $1 !~ /^[a-f0-9]{64}$/ { bad=1; next }
  { print $2 }
  END { exit bad }
' SHA256SUMS.txt > /tmp/animus-release-files.lst

echo "[verify-release-artifacts] checking listed files exist"
while IFS= read -r artifact; do
  test -f "${artifact}"
done < /tmp/animus-release-files.lst

echo "[verify-release-artifacts] verifying checksums"
sha256sum --check SHA256SUMS.txt

echo "[verify-release-artifacts] validating SBOM shape"
rg -n '"bomFormat"\s*:\s*"CycloneDX"' sbom.cdx.json
rg -n '"specVersion"' sbom.cdx.json

echo "[verify-release-artifacts] PASS"
