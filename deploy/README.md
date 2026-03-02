Local deployment helpers.

Signed-token relay defaults:
- Relay server requires trusted Ed25519 issuer public key(s).
- Set `ANIMUS_RELAY_TOKEN_ISSUER_PUBKEY_HEX` before starting compose.
- Optional relay identifier override:
  - `ANIMUS_RELAY_NAME` (default: `default-relay`)
- Quota/abuse control environment variables:
  - `ANIMUS_RELAY_MAX_ALLOC_PER_ISSUER` (default: `256`)
  - `ANIMUS_RELAY_MAX_ALLOC_PER_SUBJECT` (default: `64`)
  - `ANIMUS_RELAY_MAX_BINDINGS_PER_ALLOC` (default: `16`)
  - `ANIMUS_RELAY_MAX_TOKEN_PAYLOAD_BYTES` (default: `1024`)
  - `ANIMUS_RELAY_MAX_PACKET_SIZE_BYTES` (default: `2048`)

Example:
```bash
export ANIMUS_RELAY_TOKEN_ISSUER_PUBKEY_HEX=d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a
export ANIMUS_RELAY_MAX_ALLOC_PER_SUBJECT=64
export ANIMUS_RELAY_MAX_BINDINGS_PER_ALLOC=16
docker compose -f deploy/docker-compose.yml up --build
```
