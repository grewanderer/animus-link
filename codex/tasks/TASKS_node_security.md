# Tasks — Node security (must-have for MVP)

1) Logging redaction layer
- Add `crates/fabric-security` or module with `redact()` helpers.
- Ensure all apps use it for any structured logging fields.
- Add tests: secrets not present in log strings.

2) Keystore abstraction
- Define `KeyStore` trait in `crates/fabric-identity`.
- Implement OS-specific modules (feature-gated):
  - macos: Keychain
  - windows: DPAPI
  - linux: libsecret (fallback: encrypted file using key from env/OS)
- MVP acceptable: compile-time stubs for non-target OS, but fail-fast with clear error.

3) Pre-auth DoS limits
- Add handshake limiter interface in `crates/fabric-session`:
  - per-IP token bucket
  - global cap
- Add packet size caps in transports.

4) Disable core dumps + zeroize
- Add `apps/*` startup hardening:
  - disable core dumps where possible
  - ensure secret buffers use `zeroize` and are dropped promptly
