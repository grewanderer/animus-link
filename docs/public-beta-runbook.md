# Public Beta Runbook

Operator checklist for launching and validating Animus Link public beta with signed relay tokens enabled by default.

## Launch Checklist (One Pager)

1. Download release artifacts and integrity files:
   - platform bundles, `SHA256SUMS.txt`, `sbom.cdx.json`
2. Verify checksums:
```bash
sha256sum --check SHA256SUMS.txt
```
3. Keep `sbom.cdx.json` with deployment records.
4. Export required relay env vars (placeholders only):
```bash
export ANIMUS_RELAY_TOKEN_ISSUER_PUBKEY_HEX="<issuer-pubkey-hex>"
export ANIMUS_RELAY_NAME="default-relay"
export ANIMUS_RELAY_MAX_ALLOC_PER_ISSUER="256"
export ANIMUS_RELAY_MAX_ALLOC_PER_SUBJECT="64"
export ANIMUS_RELAY_MAX_BINDINGS_PER_ALLOC="16"
export ANIMUS_RELAY_MAX_TOKEN_PAYLOAD_BYTES="1024"
export ANIMUS_RELAY_MAX_PACKET_SIZE_BYTES="2048"
```
5. Start relay:
```bash
docker compose -f deploy/docker-compose.yml up --build -d
```
6. Verify relay liveness/readiness:
```bash
curl -fsS http://127.0.0.1:9780/healthz
```
7. Verify relay metrics endpoint:
```bash
curl -fsS http://127.0.0.1:9780/metrics | awk '/quota_rejected_total|auth_failures_total|rate_limited_total/'
```
8. Start link-daemon:
```bash
cargo run -p link-daemon -- \
  --api-bind 127.0.0.1:9999 \
  --state-file /tmp/animus-link-state.json \
  --relay-addr 127.0.0.1:7777 \
  --relay-name default-relay \
  --relay-token-signing-key-file /secure/path/relay-issuer-seed.hex
```
9. Verify daemon health:
```bash
curl -fsS http://127.0.0.1:9999/v1/health
```
10. Verify self-check:
```bash
curl -fsS http://127.0.0.1:9999/v1/self_check | awk '/"api_version":"v1"/ && /"checks"/'
```
11. Verify diagnostics:
```bash
curl -fsS http://127.0.0.1:9999/v1/diagnostics | awk '/"mobile_policy":"foreground_only"/'
```
12. Verify quota settings are active via relay metrics:
```bash
curl -fsS http://127.0.0.1:9780/metrics | awk '/quota_rejected_total\{reason="issuer_limit"\}|quota_rejected_total\{reason="subject_limit"\}/'
```
13. Run signed relay-first smoke/e2e:
```bash
bash scripts/demo-relay-first-e2e.sh
```
14. Run reproducible local verification scripts:
```bash
bash scripts/verify-desktop.sh
bash scripts/verify-android.sh
bash scripts/verify-ios-build.sh
bash scripts/verify-release-artifacts.sh dist
```
15. Confirm no unsigned-token bypass in runtime config (`--dev-allow-unsigned-tokens` absent).
16. Keep logs at `info` unless actively debugging a production incident.
17. For full-tunnel gateway internal testing, set optional DNS upstream:
```bash
export ANIMUS_GATEWAY_DNS_UPSTREAM="127.0.0.1:53"
```

## A) Preconditions

1. Confirm release artifacts are available:
   - Desktop binaries: `relay-server`, `link-daemon`, `link-cli`, `fabric-cli`, `conformance-runner`
   - Android: `android-apk` and `android-rust-libs` (contains `libfabric_ffi.so` for `arm64-v8a` and `x86_64`)
   - iOS: `ios-ipa` (unsigned CI artifact for validation), `ios-build` app zip, `ios-xcframework`
2. Confirm required environment variables and key material are prepared:
   - `ANIMUS_RELAY_TOKEN_ISSUER_PUBKEY_HEX` (required for relay)
   - `ANIMUS_RELAY_NAME` (optional, defaults to `default-relay`)
   - Link daemon signing seed (32-byte Ed25519 seed, hex) supplied by file or `--relay-token-signing-seed-hex`
3. Confirm supported platform baselines:
   - Desktop: Linux/macOS/Windows (CI-validated on GitHub-hosted latest images)
   - Android: min SDK 26 (Android 8.0+), target SDK 34
   - iOS: iOS 16.0+ (project deployment target)
4. Confirm Rust toolchain prerequisites for operator validation:
   - `rustfmt` and `clippy` components available (`rust-toolchain.toml` pins both)

## B) Key Management and Rotation (Signed Relay Tokens)

### Generate issuer keys

Development (non-production test keypair):
1. Use the documented test values only in local/dev environments.
2. Never reuse dev seed in production.

Production (recommended offline generation):
```bash
# Generate Ed25519 private key (PKCS8 PEM)
openssl genpkey -algorithm Ed25519 -out relay-issuer-ed25519.pem

# Extract public key PEM
openssl pkey -in relay-issuer-ed25519.pem -pubout -out relay-issuer-ed25519.pub.pem

# Extract 32-byte private seed and public key as hex for app/relay config
openssl pkey -in relay-issuer-ed25519.pem -outform DER | tail -c 32 | xxd -p -c 64 > relay-issuer-seed.hex
openssl pkey -in relay-issuer-ed25519.pem -pubout -outform DER | tail -c 32 | xxd -p -c 64 > relay-issuer-pub.hex
```

### Store and configure keys

1. Store signing seed in secure secret storage:
   - Preferred: OS keystore integration
   - Fallback: encrypted secret manager value or file with restricted permissions (`0600`)
2. Configure `link-daemon` signer:
   - `--relay-token-signing-key-id` for logical key identifier
   - `--relay-token-signing-seed-hex` or `--relay-token-signing-key-file`
3. Configure `relay-server` verifier:
   - `--token-issuer-pubkey-hex <hex>` (single key)
   - multiple keys supported via comma-separated values for overlapping rotation windows

### TTL/skew/rotation recommendations

1. Token TTL: 120 seconds default for beta.
2. Clock skew tolerance: 60 seconds.
3. Rotation process:
   - Add new public key to relay allow-list (old + new)
   - Roll out new signing seed to all daemons
   - Wait at least `max(token_ttl + skew + max_allocation_ttl)` before removing old key
   - Remove old key from relay allow-list and redeploy relay

### Emergency revoke/rotate

1. Immediately remove compromised public key from relay configuration and restart relay.
2. Roll out a new signing seed and key-id to all link daemons.
3. Restart/roll relay and daemons to clear active allocations using revoked key.
4. Verify with smoke tests in section D before reopening traffic.

## C) Deployment

### Relay via docker-compose (signed tokens required)

```bash
export ANIMUS_RELAY_TOKEN_ISSUER_PUBKEY_HEX="<32-byte-ed25519-pubkey-hex>"
export ANIMUS_RELAY_NAME="default-relay"   # optional
export ANIMUS_RELAY_MAX_ALLOC_PER_ISSUER="256"
export ANIMUS_RELAY_MAX_ALLOC_PER_SUBJECT="64"
export ANIMUS_RELAY_MAX_BINDINGS_PER_ALLOC="16"
export ANIMUS_RELAY_MAX_TOKEN_PAYLOAD_BYTES="1024"
docker compose -f deploy/docker-compose.yml up --build -d
```

### Recommended runtime settings

1. Network:
   - Relay UDP: `7777/udp`
   - Link daemon API: bind loopback by default (`127.0.0.1:<port>`)
2. Resource recommendations per relay instance (starting point):
   - CPU: 1 vCPU minimum
   - RAM: 512 MiB minimum
   - File descriptors: >= 8192
3. Keep `--dev-allow-unsigned-tokens` disabled in production.
4. Keep quota defaults conservative for beta:
   - per-issuer allocations: `256`
   - per-subject allocations: `64`
   - per-allocation bindings: `16`
   - max token payload bytes: `1024`
   - max packet size bytes: `2048`
5. Gateway dataplane (userspace NAT) recommended start values:
   - max sessions: `256`
   - max IP packet bytes: `2048`
   - UDP idle timeout: `30s`
   - TCP idle timeout: `30s`

### Health checks

```bash
docker compose -f deploy/docker-compose.yml ps
docker compose -f deploy/docker-compose.yml logs --tail=50 relay
```

Expected:
1. Relay container is `Up`.
2. No startup errors about missing/invalid issuer public keys.

Link daemon health/diagnostics endpoints:
```bash
curl -s http://127.0.0.1:9999/v1/health
curl -s http://127.0.0.1:9999/v1/self_check
curl -s http://127.0.0.1:9999/v1/diagnostics
curl -s http://127.0.0.1:9999/v1/metrics
```

Expected:
1. `/v1/health` returns `{"api_version":"v1","ok":true,...}`.
2. `/v1/self_check` returns stable checks list with safe details (no invites/tokens/keys).
3. `/v1/diagnostics` returns config/counters/error aggregates only (redacted).
4. `/v1/metrics` returns Prometheus text counters only.

## D) Smoke Tests (Copy/Paste)

The following verifies signed-token relay flow without printing tokens.

```bash
set -euo pipefail

RELAY_ADDR="127.0.0.1:17777"
DAEMON_A_API="127.0.0.1:19001"
DAEMON_B_API="127.0.0.1:19002"
ECHO_ADDR="127.0.0.1:19180"

# Provide secure values from your secret store/files (do not echo them)
RELAY_ISSUER_PUBKEY_HEX="$(cat /secure/path/relay-issuer-pub.hex)"
RELAY_ISSUER_SEED_HEX="$(cat /secure/path/relay-issuer-seed.hex)"

cargo run -p relay-server -- \
  --bind "${RELAY_ADDR}" \
  --relay-name "default-relay" \
  --token-issuer-pubkey-hex "${RELAY_ISSUER_PUBKEY_HEX}" \
  >/tmp/animus-relay.log 2>&1 &
RELAY_PID=$!

cargo run -p link-daemon -- \
  --api-bind "${DAEMON_A_API}" \
  --state-file /tmp/animus-a-namespaces.json \
  --relay-addr "${RELAY_ADDR}" \
  --relay-name "default-relay" \
  --relay-token-signing-seed-hex "${RELAY_ISSUER_SEED_HEX}" \
  >/tmp/animus-daemon-a.log 2>&1 &
DAEMON_A_PID=$!

cargo run -p link-daemon -- \
  --api-bind "${DAEMON_B_API}" \
  --state-file /tmp/animus-b-namespaces.json \
  --relay-addr "${RELAY_ADDR}" \
  --relay-name "default-relay" \
  --relay-token-signing-seed-hex "${RELAY_ISSUER_SEED_HEX}" \
  >/tmp/animus-daemon-b.log 2>&1 &
DAEMON_B_PID=$!

sleep 2

# Status checks
curl -s "http://${DAEMON_A_API}/v1/status" | awk '/"api_version":"v1"/ && /"path":"relay"/'
curl -s "http://${DAEMON_B_API}/v1/status" | awk '/"api_version":"v1"/ && /"path":"relay"/'

# Self-check + diagnostics (do not print secrets)
curl -s "http://${DAEMON_A_API}/v1/self_check" | awk '/"api_version":"v1"/ && /"checks"/'
curl -s "http://${DAEMON_A_API}/v1/diagnostics" | awk '/"api_version":"v1"/ && /"config_summary"/'

# Invite create/join (invite is not printed)
INVITE="$(curl -s -X POST "http://${DAEMON_A_API}/v1/invite/create" | awk -F'"invite":"' '{print $2}' | awk -F'"' '{print $1}')"
curl -s -X POST "http://${DAEMON_B_API}/v1/invite/join" \
  -H "content-type: application/json" \
  -d "{\"invite\":\"${INVITE}\"}" >/dev/null

# Expose + connect
curl -s -X POST "http://${DAEMON_A_API}/v1/expose" \
  -H "content-type: application/json" \
  -d "{\"service_name\":\"echo\",\"local_addr\":\"${ECHO_ADDR}\",\"allowed_peers\":[\"peer-b\"]}" >/dev/null

CONNECT_JSON="$(curl -s -X POST "http://${DAEMON_B_API}/v1/connect" \
  -H "content-type: application/json" \
  -d '{"service_name":"echo"}')"
LOCAL_PROXY="$(printf '%s' "${CONNECT_JSON}" | awk -F'"local_addr":"' '{print $2}' | awk -F'"' '{print $1}')"
test -n "${LOCAL_PROXY}"

# Preferred final gate: existing signed-token relay-first integration test
cargo test -p link-daemon api::tests::relay_first_expose_connect_roundtrip_bytes -- --nocapture

kill "${RELAY_PID}" "${DAEMON_A_PID}" "${DAEMON_B_PID}" >/dev/null 2>&1 || true
```

Expected:
1. `/v1/status` responses include `api_version: "v1"` and `path: "relay"`.
2. `/v1/self_check` includes required checks (`keystore_ok`, `token_issuer_config_ok`, `relay_reachable`, `token_mint_verify_ok`, `namespace_store_ok`, `port_bind_conflicts`).
3. `connect` response includes non-empty `local_addr`.
4. Integration test passes with roundtrip success.

### Full-tunnel gateway dataplane smoke (internal beta)

Linux runtime prerequisites for real OS routing/TUN:
1. `/dev/net/tun` available.
2. Process has `CAP_NET_ADMIN` (or root privileges) for interface/route/DNS changes.
3. In CI or restricted environments, set `ANIMUS_TUNNEL_USE_MOCK=1` to exercise control/data-plane logic without privileged route changes.
4. For `dns_mode=remote_strict`, process also needs low-port bind capability (`CAP_NET_BIND_SERVICE`) or root.

Example capability setup for strict mode:
```bash
# Replace with the deployed binary path.
sudo setcap cap_net_admin,cap_net_bind_service+ep ./target/debug/link-daemon
```

Enable gateway service on node A:
```bash
curl -s -X POST "http://${DAEMON_A_API}/v1/gateway/expose" \
  -H "content-type: application/json" \
  -d '{"mode":"exit","listen":"0.0.0.0:0","nat":true,"allowed_peers":["peer-b"]}'
```

Enable tunnel mode on node B:
```bash
curl -s -X POST "http://${DAEMON_B_API}/v1/tunnel/enable" \
  -H "content-type: application/json" \
  -d '{"gateway_service":"gateway-exit","fail_mode":"open_fast","dns_mode":"remote_best_effort","exclude_cidrs":["10.0.0.0/8"],"allow_lan":true}'
```

Check tunnel status transitions:
```bash
curl -s "http://${DAEMON_B_API}/v1/tunnel/status" | awk '/"state":"enabling"|"state":"connecting"|"state":"connected"|"state":"degraded"/'
```

Verify prewarm lifecycle and readiness:
```bash
curl -s "http://${DAEMON_B_API}/v1/tunnel/status" | awk '/"prewarm_state":"idle"|"prewarm_state":"warming"|"prewarm_state":"ready"|"prewarm_state":"error"/'
curl -s "http://${DAEMON_B_API}/v1/metrics" | awk '/prewarm_ready_gauge|prewarm_attempts_total|prewarm_fail_total/'
```

Enable kill-switch mode (best-effort Linux route-based block):
```bash
curl -s -X POST "http://${DAEMON_B_API}/v1/tunnel/enable" \
  -H "content-type: application/json" \
  -d '{"gateway_service":"gateway-exit","fail_mode":"closed","dns_mode":"remote_strict","exclude_cidrs":[],"allow_lan":false}'
```

Run deterministic relay+tunnel integration test:
```bash
cargo test -p link-daemon api::tests::relay_gateway_tunnel_roundtrip_http_via_ip_packets -- --nocapture
```

Disable tunnel and verify restored non-tunnel state:
```bash
curl -s -X POST "http://${DAEMON_B_API}/v1/tunnel/disable"
curl -s "http://${DAEMON_B_API}/v1/tunnel/status" | awk '/"state":"disabled"/'
```

Manual egress validation (operator workstation only):
```bash
# Run on a client where tunnel mode is connected; expect gateway egress IP.
curl -4 https://ifconfig.me
```
Note:
1. This check is manual and not part of CI.
2. In `dns_mode=system`, DNS leakage is possible; use remote DNS modes for safety.
3. `dns_mode=remote_best_effort` uses a local DNS stub on `127.0.0.1:<high-port>` and needs port-aware `resolvectl`.
4. `dns_mode=remote_strict` binds the DNS stub to `127.0.0.1:53` and guarantees remote DNS on Linux when capabilities are available.
5. If strict setup fails:
   - `fail_mode=open_fast`: status degrades with `dns_strict_*` code and DNS/routes are restored.
   - `fail_mode=closed`: keep fail-closed block while preserving protected routes.

Common `/v1/self_check` codes:
1. `ok`: check passed.
2. `relay_not_configured`: relay endpoint missing from daemon config.
3. `relay_timeout` / `relay_unreachable`: relay probe failed.
4. `keystore_unavailable`: keystore backend unavailable or failing.
5. `token_*`: token mint/verify local roundtrip failed.
6. `namespace_store_unavailable`: local namespace store read/write failed.
7. `bind_check_failed` / `port_not_bound`: API bind verification issue.
8. `tun_missing`: Linux TUN device missing (`/dev/net/tun`).
9. `cap_net_admin_missing`: Linux process lacks route-control capability.
10. `bind53_missing`: strict remote DNS requested but low-port bind capability missing.

Diagnostics policy note:
1. `config_summary.mobile_policy` is `foreground_only` for public beta on all platforms.
2. Treat any other value as a configuration/version mismatch during beta.

## E) Mobile Distribution (Operator-Facing, Manual)

Store upload remains manual because credentials/signing identities are not in CI.

### Android

1. Download release artifacts:
   - `android-apk` (`app-debug.apk`)
   - `android-rust-libs` (`libfabric_ffi.so` bundle)
2. Validate install and basic startup in internal QA.
3. In app, enter relay addr + signed token + gateway service; set fail mode (`open_fast` default).
4. Tap `Start Tunnel`, approve Android VPN permission, and verify tunnel state reaches `connected`.
5. Validate stop behavior:
   - `open_fast`: app returns to normal routing within ~2s after drop.
   - `closed`: VPN remains active while disconnected until manually stopped/recovered.
6. Confirm UI shows `Foreground-only (Public Beta)` and status refreshes on app resume.
7. Upload APK/AAB via Google Play Console:
   - Internal testing track first
   - Promote to closed/public after QA signoff

### iOS

1. Download release artifacts:
   - `ios-ipa` (unsigned validation artifact)
   - `ios-xcframework`
2. Re-sign/archive with production certificates/profiles in your Apple developer environment.
3. Ensure app + extension entitlements include `packet-tunnel-provider`.
4. Open app, tap `Start Tunnel`, approve iOS VPN prompt, and verify tunnel state transitions (`connecting` -> `connected`).
5. Tap `Stop Tunnel` and verify disconnected state.
6. Confirm UI shows `Foreground-only (Public Beta)` and status refreshes on foreground activation.
7. Upload signed IPA using Xcode Organizer or Transporter to App Store Connect/TestFlight.
8. Roll out to internal testers, then external beta groups.

## F) Observability and Incident Response

### Logging

1. Relay logs:
   - `docker compose -f deploy/docker-compose.yml logs -f relay`
2. Daemon logs:
   - service manager output or redirected files (for example `/tmp/animus-daemon-*.log`)
3. Safe debug guidance:
   - keep `RUST_LOG=info` in production
   - use `RUST_LOG=debug` only for short incident windows
   - never enable debug settings that dump raw payloads/tokens

### Common failure modes

1. Token verification failures:
   - Symptoms: allocations rejected, close reason `allocate_rejected`
   - Actions: verify relay pubkey config, relay name match, clock sync, token TTL
2. Relay rate limiting:
   - Symptoms: packet drops, intermittent connect failures
   - Actions: inspect pre-auth limit settings, check traffic spikes, scale relay instances
3. Invite expired:
   - Symptoms: `/v1/invite/join` returns invalid input/expired
   - Actions: create a new invite and re-join
4. Port bind conflicts:
   - Symptoms: startup `Operation not permitted` / address in use
   - Actions: change bind ports, stop conflicting process, re-run smoke tests

### Incidents and First Response

1. Token invalid spikes:
   - Symptoms: rising `auth_failures_total`, frequent `allocate_rejected`
   - First response:
```bash
curl -fsS http://127.0.0.1:9780/metrics | awk '/auth_failures_total|allocations_rejected_total/'
curl -fsS http://127.0.0.1:9999/v1/self_check
```
   - Actions: verify issuer pubkey, relay name, clock skew, token TTL, key rotation state.
2. Quota rejects spikes:
   - Symptoms: rising `quota_rejected_total{reason=...}`
   - First response:
```bash
curl -fsS http://127.0.0.1:9780/metrics | awk '/quota_rejected_total/'
```
   - Actions: identify hot issuer/subject cohort operationally, tune limits cautiously, confirm abuse vs legitimate load.
3. Relay overload:
   - Symptoms: increasing `drops_total`, `rate_limited_total`, latency bucket growth
   - First response:
```bash
curl -fsS http://127.0.0.1:9780/metrics | awk '/drops_total|rate_limited_total|handshake_or_ctrl_latency_ms_bucket/'
```
   - Actions: scale relay replicas, tighten pre-auth limits for abuse traffic, reduce noisy clients.
4. Gateway dataplane pressure:
   - Symptoms: increasing `gateway_sessions_evicted_total` or `gateway_drops_*`
   - First response:
```bash
curl -fsS http://127.0.0.1:9999/v1/metrics | awk '/gateway_packets_in_total|gateway_packets_out_total|gateway_sessions_active|gateway_sessions_evicted_total|gateway_drops_malformed_total|gateway_drops_quota_total/'
```
   - Actions: reduce tunnel load, increase session bound carefully, validate packet size policy on clients.
5. Rollback steps:
   - redeploy previous release artifacts
   - restore previous trusted issuer key set if needed
   - restart relay + daemons
   - re-run launch checklist steps 6-13

### Rollback

1. Redeploy previous release artifacts (desktop/mobile bundles) from GitHub release.
2. Restore previous known-good relay public key set.
3. Restart relay and daemons.
4. Re-run smoke tests in section D.

## Local Verification Scripts

Use these scripts for repeatable operator checks:

```bash
# Desktop API/runtime smoke (non-privileged)
bash scripts/verify-desktop.sh

# Android build + unit tests + APK output checks
bash scripts/verify-android.sh

# iOS host+extension build checks (macOS/Xcode required)
bash scripts/verify-ios-build.sh

# Release integrity file checks in local dist/
bash scripts/verify-release-artifacts.sh dist

# Linux full-tunnel prerequisites and non-privileged tunnel tests
bash scripts/verify-full-tunnel-linux.sh
```

## G) Security Checklist (Launch Gate)

1. Signed tokens enforced on relay (default verifier active).
2. `--dev-allow-unsigned-tokens` not used in production.
3. Link daemon Expose remains deny-by-default (`allowed_peers` required).
4. No secrets/tokens/invites/keys in logs.
5. Conformance and launch verification gates pass:
   - `cargo run -p conformance-runner -- --run all`
   - `bash scripts/launch-verify.sh`
