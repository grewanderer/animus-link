#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "[verify-android] checking prerequisites"
if ! command -v cargo >/dev/null 2>&1; then
  echo "[verify-android] error: cargo is required" >&2
  exit 2
fi
if ! command -v cargo-ndk >/dev/null 2>&1; then
  echo "[verify-android] error: cargo-ndk is required (install: cargo install cargo-ndk --locked)" >&2
  exit 2
fi

echo "[verify-android] build Rust .so + UniFFI Kotlin bindings"
bash mobile/android/scripts/build-rust-android.sh

echo "[verify-android] verify Rust/UniFFI artifacts"
test -f mobile/android/app/src/main/jniLibs/arm64-v8a/libfabric_ffi.so
test -f mobile/android/app/src/main/jniLibs/x86_64/libfabric_ffi.so
test -f mobile/android/app/src/main/kotlin/com/animus/link/bindings/animus_link.kt

echo "[verify-android] run Gradle unit tests + assemble debug APK"
if [[ -x mobile/android/gradlew ]]; then
  (
    cd mobile/android
    ./gradlew --no-daemon testDebugUnitTest assembleDebug
  )
elif command -v gradle >/dev/null 2>&1; then
  (
    cd mobile/android
    gradle --no-daemon testDebugUnitTest assembleDebug
  )
else
  echo "[verify-android] error: neither mobile/android/gradlew nor gradle is available" >&2
  exit 2
fi

echo "[verify-android] verify APK output"
test -f mobile/android/app/build/outputs/apk/debug/app-debug.apk

echo "[verify-android] PASS"
