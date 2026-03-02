# Relay (MVP)

Security invariants:
- Relay NEVER terminates e2e encryption.
- Relay only forwards `RELAY_DATA` bytes; it cannot decrypt payloads.
- Relay MUST NOT log relay tokens, invite secrets, or payload bytes.

Auth:
- Short-lived relay tokens (signed by control service). Relay verifies locally.
- Token format (stable v1):
  - `animus://rtok/v1/<payload>.<signature>`
  - `<payload>` is lowercase hex of canonical deterministic JSON (JCS-style field ordering).
  - `<signature>` is lowercase hex of Ed25519 signature bytes over canonical payload bytes.
  - Maximum token size: 2048 bytes.
- Canonical payload JSON required claims:
  - `ver` (number): MUST be `1`
  - `sub` (string): subject namespace or node identifier
  - `relay_name` (string): relay allow-list claim
  - `exp` (u64): expiry unix epoch seconds
  - `nbf` (u64, optional): not-before unix epoch seconds; if omitted, treat as `now`
  - `nonce` (string, optional)
  - `scopes` (array<string>, optional)
- Validation rules:
  - Signature MUST verify against configured trusted issuer public key(s).
  - `relay_name` claim MUST match relay runtime `relay_name`.
  - Clock skew tolerance is 60 seconds.
  - `nbf` is accepted only if `now + 60 >= nbf`.
  - `exp` is accepted only if `now <= exp + 60`.
- Allocation TTL is enforced as:
  - `granted_ttl = min(requested_ttl, max_allocation_ttl, (exp+60)-now)`
  - If `granted_ttl == 0`, allocation MUST be rejected.
- Signature verification is pluggable through a verifier interface.
  - Production behavior MUST verify signatures.
  - A dev-only unsigned mode may exist behind an explicit flag.

Transport and packet framing (MVP):
- UDP datagrams.
- Relay packet header:
  - Byte 0: kind (`0x01` = RELAY_CTRL, `0x02` = RELAY_DATA)
  - Byte 1: packet version (`1`)
- RELAY_CTRL body:
  - UTF-8 JSON envelope with schema version:
  - `{"version":1,"type":"...","...":...}`
- RELAY_DATA body:
  - `conn_id` (`u64`, little-endian), followed by opaque payload bytes.
  - For Fabric data-plane, opaque payload bytes are full Fabric frame bytes
    (`FrameHeader` + encrypted payload).

Relay control messages:
- ALLOCATE {token, requested_ttl}
- BIND {conn_id}
- PING/PONG
- CLOSE

Relay data:
- conn_id + opaque frame bytes

State model (MVP):
- Allocations keyed by client transport session (source socket address in UDP MVP).
- Bindings map `conn_id` to up to two peers.
- `RELAY_DATA` forwarding copies incoming packet bytes to the bound peer unchanged.

Pre-auth DoS protections:
- Enforce packet size cap before parsing control payloads.
- Enforce per-IP and global token buckets.
- Packets that fail limits or decode/validation are dropped or closed without leaking secrets in logs.
