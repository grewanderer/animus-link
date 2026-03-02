# Animus Fabric / Link — MVP Monorepo (starter)

This repository is a **starter scaffold** for implementing the MVP described in `spec/`.
It is structured so multiple Codex agents can work in parallel with clear ownership boundaries.

## What you get
- Rust workspace with crates for wire/crypto/identity/session/relay/service.
- Conformance vectors + runner placeholder.
- Security hardening baseline (logging redaction, secret storage interfaces, DoS limits, signed updates policy).
- Local dev via docker-compose for relay.
- CI workflows for fmt/clippy/test/conformance + basic security checks.

## Quickstart
```bash
# 1) Install Rust (stable) and (optional) cargo tools
rustup show

# 2) Build everything
cargo build --workspace

# 3) Run unit tests
cargo test --workspace

# 4) Run conformance (placeholder runner)
cargo run -p conformance-runner -- --list

# 5) Run relay locally
export ANIMUS_RELAY_TOKEN_ISSUER_PUBKEY_HEX=d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a
docker compose -f deploy/docker-compose.yml up --build

# 6) Run link daemon local API
cargo run -p link-daemon -- \
  --api-bind 127.0.0.1:9999 \
  --relay-addr 127.0.0.1:7777 \
  --relay-name default-relay \
  --relay-token-signing-seed-hex 9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60

# 7) Relay-first e2e demo (relay + two daemons + echo proxy)
bash scripts/demo-relay-first-e2e.sh
```

Local daemon API (MVP):
- `GET /v1/health`
- `GET /v1/status`
- `GET /v1/self_check`
- `GET /v1/diagnostics`
- `GET /v1/metrics`
- `POST /v1/invite/create`
- `POST /v1/invite/join`
- `POST /v1/expose`
- `POST /v1/connect`

API examples:
```bash
curl -s http://127.0.0.1:9999/v1/status
curl -s http://127.0.0.1:9999/v1/self_check
curl -s http://127.0.0.1:9999/v1/diagnostics
curl -s -X POST http://127.0.0.1:9999/v1/invite/create
curl -s -X POST http://127.0.0.1:9999/v1/invite/join \
  -H 'content-type: application/json' \
  -d '{"invite":"animus://invite/v1/..."}'
curl -s -X POST http://127.0.0.1:9999/v1/expose \
  -H 'content-type: application/json' \
  -d '{"service_name":"echo","local_addr":"127.0.0.1:19180","allowed_peers":["peer-b"]}'
curl -s -X POST http://127.0.0.1:9999/v1/connect \
  -H 'content-type: application/json' \
  -d '{"service_name":"echo"}'
```

Security defaults:
- Relay accepts signed tokens only by default.
- `--dev-allow-unsigned-tokens` is development-only.
- Relay quota controls are enabled with conservative defaults (issuer/subject/bindings/token-size).
- Link daemon expose is deny-by-default and requires explicit `allowed_peers`.
- Public beta mobile policy is foreground-only (`mobile_policy: "foreground_only"`).
- Logs must never include invites, tokens, keys, or payload bytes.

## What This Is / Isn’t
- Is:
  - relay-first secure overlay for service access using L4 `Expose`/`Connect`
  - end-to-end encrypted payload forwarding (relay does not decrypt payload)
  - invite-first onboarding plus signed relay-token policy controls
- Isn’t (public beta):
  - always-on full-device VPN by default (full-tunnel is opt-in beta mode)
  - always-on iOS background VPN/runtime
  - public DHT-style open discovery network
- See:
  - [`docs/positioning.md`](docs/positioning.md)
  - [`docs/public-beta-faq.md`](docs/public-beta-faq.md)

Public beta artifact flow:
- CI builds and tests Linux/macOS/Windows + Android + iOS.
- Release workflow publishes:
  - Desktop binaries
  - Android APK + Rust `.so` bundle
  - iOS IPA (unsigned test artifact) + `.xcframework`

Mobile distribution:
- Android: upload CI APK to Google Play Internal/Closed testing.
- iOS: upload CI IPA/TestFlight build from Xcode Organizer or Transporter.
- See:
  - `mobile/android/README.md`
  - `mobile/ios/README.md`

Beta limitations:
- Mobile runtime policy is `foreground_only` during public beta.
- Android/iOS apps refresh status on resume/foreground.
- Background service / always-on mobile connectivity is not enabled.

## Public Beta Operators
- Launch checklist and incident guidance:
  - [`docs/public-beta-runbook.md`](docs/public-beta-runbook.md)
- Release integrity verification:
  - [`docs/how-to-verify-release.md`](docs/how-to-verify-release.md)
- Product/GTM consistency docs:
  - [`docs/positioning.md`](docs/positioning.md)
  - [`docs/public-beta-faq.md`](docs/public-beta-faq.md)
- Endpoint-level diagnostics for beta support are documented in the same runbook:
  - `/v1/self_check`
  - `/v1/diagnostics`
- Documentation index:
  - [`docs/README.md`](docs/README.md)

## Repo layout
- `spec/` — normative specs (wire, state machine, identity, relay, node security)
- `conformance/` — vectors + harness
- `crates/` — Fabric libraries
- `apps/` — binaries: relay server, link daemon/cli, fabric cli
- `codex/` — agent playbooks + task lists

> NOTE: This scaffold intentionally ships with **TODO markers** where implementation decisions must be finalized
> (e.g., canonical encoding choice, QUIC-vs-TCP fallback).
