#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <log_file> <gradle_args...>" >&2
  exit 2
fi

LOG_FILE="$1"
shift

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ANDROID_DIR="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
WRAPPER_DIR="${ANDROID_DIR}/gradle/wrapper"
LOCAL_DIST_ZIP="${ANIMUS_GRADLE_DIST_ZIP:-${WRAPPER_DIR}/gradle-8.7-bin.zip}"
GRADLE_CMD=(./gradlew --no-daemon --stacktrace "$@")

mkdir -p "$(dirname "${LOG_FILE}")"

seed_local_dist_asset() {
  if [ -s "${LOCAL_DIST_ZIP}" ]; then
    return 0
  fi
  discovered_zip="$(ls -1 "${HOME}/.gradle/wrapper/dists/gradle-8.7-bin"/*/gradle-8.7-bin.zip 2>/dev/null | head -n1 || true)"
  if [ -n "${discovered_zip}" ] && [ -f "${discovered_zip}" ]; then
    cp "${discovered_zip}" "${LOCAL_DIST_ZIP}"
  fi
}

run_attempt() {
  local mode="$1"
  local append_log="$2"
  local rc=0

  set +e
  if [ "${mode}" = "local" ]; then
    if [ "${append_log}" = "1" ]; then
      (
        cd "${ANDROID_DIR}"
        ANIMUS_GRADLE_DIST_LOCAL=1 ANIMUS_GRADLE_DIST_ZIP="${LOCAL_DIST_ZIP}" "${GRADLE_CMD[@]}"
      ) 2>&1 | tee -a "${LOG_FILE}"
    else
      (
        cd "${ANDROID_DIR}"
        ANIMUS_GRADLE_DIST_LOCAL=1 ANIMUS_GRADLE_DIST_ZIP="${LOCAL_DIST_ZIP}" "${GRADLE_CMD[@]}"
      ) 2>&1 | tee "${LOG_FILE}"
    fi
  else
    if [ "${append_log}" = "1" ]; then
      (
        cd "${ANDROID_DIR}"
        "${GRADLE_CMD[@]}"
      ) 2>&1 | tee -a "${LOG_FILE}"
    else
      (
        cd "${ANDROID_DIR}"
        "${GRADLE_CMD[@]}"
      ) 2>&1 | tee "${LOG_FILE}"
    fi
  fi
  rc=${PIPESTATUS[0]}
  set -e

  return "${rc}"
}

if run_attempt "online" "0"; then
  seed_local_dist_asset
  exit 0
fi

echo "Primary Gradle attempt failed: ${GRADLE_CMD[*]}" | tee -a "${LOG_FILE}"
if [ ! -f "${LOCAL_DIST_ZIP}" ]; then
  echo "Fallback unavailable: local Gradle dist zip not found at ${LOCAL_DIST_ZIP}" | tee -a "${LOG_FILE}"
  exit 1
fi

echo "Retrying once with ANIMUS_GRADLE_DIST_LOCAL=1 and ${LOCAL_DIST_ZIP}" | tee -a "${LOG_FILE}"
if run_attempt "local" "1"; then
  seed_local_dist_asset
  exit 0
fi

echo "Fallback Gradle attempt failed: ${GRADLE_CMD[*]}" | tee -a "${LOG_FILE}"
exit 1
