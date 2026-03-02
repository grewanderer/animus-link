# MVP Checklist (engineering gates)

## Security gates
- [ ] Keystore-backed DK storage for at least macOS/Windows/Linux (or encrypted fallback)
- [ ] Redacted logging layer; no secrets in logs (tests)
- [ ] Pre-auth DoS limits: handshake rate limit + max packet size
- [ ] Anti-replay W=4096 implemented and tested
- [ ] Relay auth token verification + rate limiting

## Protocol gates
- [ ] Wire framing stable + conformance vectors
- [ ] Noise_XX handshake stable + vectors
- [ ] State machine timeouts stable + e2e tests
