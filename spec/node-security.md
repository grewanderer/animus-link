# Node Security (MVP) — Endpoint requirements

## Secrets & storage
- Device keys (DK) MUST be stored using OS keystore where available:
  - macOS: Keychain (Secure Enclave if possible)
  - Windows: DPAPI/CNG
  - Linux: libsecret/gnome-keyring/kwallet (fallback: encrypted file)
  - iOS/Android: Keychain/Keystore
- Invite secrets and relay tokens MUST have TTL and be automatically purged.
- Secrets MUST NOT be written to logs.

## Logging
- Central redaction layer MUST remove:
  - keys, tokens, invite secrets
  - raw handshake payloads
  - full endpoint lists (log only counts unless debug explicitly enabled)

## Process hardening (best-effort MVP)
- Run unprivileged by default.
- Disable core dumps.
- Zeroize sensitive buffers.

## DoS protections
- Pre-auth packet size limits.
- Rate limit handshake attempts per IP and globally.
- Stateless retry/cookie before allocating expensive state (recommended for UDP).

Default MVP limits:
- `max_packet_size`: 2048 bytes (packets above this MUST be dropped pre-auth).
- Per-IP token bucket: capacity 32, refill 16 packets/second.
- Global token bucket: capacity 4096, refill 2048 packets/second.
- Enforcement order: size cap first, then per-IP and global rate limits.
