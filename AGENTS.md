# AGENTS.md — Animus Fabric / Link MVP

This file is the **primary instruction source** for coding agents (Codex/others).
Follow these rules strictly.

## Project goal
Implement Animus Fabric (secure connectivity core) + managed relay + Link daemon/CLI MVP.
Specs in `spec/` are normative. Do not change wire-visible behavior without updating spec and conformance vectors.

## Setup commands (local)
- Build: `cargo build --workspace`
- Unit tests: `cargo test --workspace`
- Lint: `cargo clippy --workspace --all-targets -- -D warnings`
- Format: `cargo fmt --all`
- Conformance (currently JSON-parse stub): `cargo run -p conformance-runner -- --run all`
- Run relay locally: `docker compose -f deploy/docker-compose.yml up --build`

## Approval / safety expectations
- Prefer **Suggest** or **Auto Edit** when making large structural changes.
- When executing commands, only run those in the allowlist below unless a human explicitly approves otherwise.
- Assume command execution may be **network-disabled** in sandbox modes; write tests that do not require internet.

## Allowed commands (default allowlist)
- `cargo build ...`
- `cargo test ...`
- `cargo fmt ...`
- `cargo clippy ...`
- `docker compose ...`
- `rg ...`, `fd ...`, `ls`, `cat`, `sed`, `awk`
If a command is not listed, ask for approval or propose it as a patch without executing.

## Security invariants (MVP gates)
- NEVER log secrets (keys/tokens/invites). Use redaction helpers.
- Pre-auth traffic must be allocation-bounded and rate-limited.
- Enforce anti-replay window (W=4096) for encrypted frames.
- Relay never terminates end-to-end encryption.
- Key storage must use OS keystore where possible; otherwise encrypted-at-rest fallback.
See `spec/node-security.md`.

## Where to edit what (ownership map)
- Wire format: `spec/wire.md`, `crates/fabric-wire`
- Crypto/Noise: `spec/crypto.md`, `crates/fabric-crypto`
- Identity/keystore: `spec/identity.md`, `crates/fabric-identity`
- Session/state machine: `spec/state-machine.md`, `crates/fabric-session`
- Relay protocol/server: `spec/relay.md`, `crates/fabric-relay-*`, `apps/relay-server`
- Link UX API: `spec/service-layer.md`, `apps/link-*`

## Conformance rule
Any change to:
- message types, header fields, encoding
- handshake payload contents
- replay rules / state machine timeouts that affect interoperability
MUST be accompanied by updates to:
- `spec/*`
- `conformance/vectors/*`
- tests
