# Crypto (MVP)

## Handshake
- Noise_XX
- Static identity: Ed25519 (for signatures / identity)
- Key exchange: X25519 ephemeral for forward secrecy
- AEAD: ChaCha20-Poly1305 (MVP default)

## Anti-downgrade
Bind version/capabilities/policy hash into Noise prologue.

## Key hygiene
- Ephemeral DH keys MUST NOT be reused.
- Sensitive buffers MUST be zeroized after use.
