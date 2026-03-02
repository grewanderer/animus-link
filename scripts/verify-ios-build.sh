#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "[verify-ios-build] checking prerequisites"
if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "[verify-ios-build] error: xcodebuild is required (run on macOS with Xcode)" >&2
  exit 2
fi
if ! command -v cargo >/dev/null 2>&1; then
  echo "[verify-ios-build] error: cargo is required" >&2
  exit 2
fi

echo "[verify-ios-build] generate UniFFI Swift bindings"
cargo run --quiet -p fabric-ffi --bin generate-bindings -- swift mobile/ios/Generated

echo "[verify-ios-build] xcodebuild host app + packet tunnel extension"
xcodebuild \
  -project mobile/ios/AnimusLinkIOS.xcodeproj \
  -target AnimusLinkIOS \
  -target AnimusLinkTunnelExtension \
  -configuration Debug \
  -destination generic/platform=iOS \
  -derivedDataPath mobile/ios/build \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  build

echo "[verify-ios-build] package xcframework + unsigned ipa"
bash mobile/ios/scripts/package-xcframework.sh
bash mobile/ios/scripts/package-ipa.sh

echo "[verify-ios-build] verify outputs"
test -f mobile/ios/Generated/animus_link.swift
test -f mobile/ios/Generated/animus_linkFFI.h
test -f mobile/ios/Generated/animus_linkFFI.modulemap
test -d mobile/ios/build/Build/Products/Debug-iphoneos/AnimusLinkIOS.app
test -d mobile/ios/build/Build/Products/Debug-iphoneos/AnimusLinkTunnelExtension.appex
test -f mobile/ios/build/Build/Products/Debug-iphoneos/AnimusLinkIOS-debug.ipa
test -d mobile/ios/dist/AnimusLinkFFI.xcframework

echo "[verify-ios-build] PASS"
