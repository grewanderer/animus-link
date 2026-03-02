# Connection State Machine (MVP)

States:
IDLE -> DISCOVER -> PROBE_DIRECT -> HANDSHAKE -> ESTABLISHED <-> MIGRATING -> CLOSED

Default timing policy:
- DISCOVER: 1 request + 2 retries (250ms, 500ms backoff)
- PROBE_DIRECT: 5s total max
- HANDSHAKE: 2s timeout, 1 retry (fresh ephemeral, never reused)
- KEEPALIVE: 15s (mobile-friendly), idle timeout 90s

Fallback policy:
- Try direct UDP.
- If direct fails: hole punch (2s) if applicable.
- If UDP blocked or fails: relay fallback.

Deterministic timer behavior (MVP):
- DISCOVER retries are timer-driven; after retries are exhausted, transition to CLOSED (discovery timeout).
- PROBE_DIRECT timeout transitions to HANDSHAKE over relay path.
- HANDSHAKE timeout performs one retry on the same path with fresh ephemeral key material.
- If direct HANDSHAKE retries are exhausted, transition to relay HANDSHAKE.
- If relay HANDSHAKE retries are exhausted, transition to CLOSED (handshake timeout).
- ESTABLISHED emits keepalive at 15s intervals and transitions to CLOSED on 90s idle timeout.
