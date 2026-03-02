# Wire Protocol (MVP)

## Frame header (outer)
All encrypted frames use this outer header before AEAD payload.

| Field     | Size | Notes |
|-----------|------|------|
| ConnID    | u64  | connection identifier |
| PN        | u64  | packet number, little-endian |
| StreamID  | u32  | multiplexed stream |
| Type      | u8   | message type |
| Len       | u16  | payload length (bytes) |

## Message types (MVP)
- 0x01 HANDSHAKE_INIT
- 0x02 HANDSHAKE_RESP
- 0x10 DATA
- 0x11 KEEPALIVE
- 0x12 CLOSE
- 0x20 RELAY_CTRL
- 0x21 RELAY_DATA

## Replay protection
Anti-replay window size W=4096. Frames outside the window MUST be dropped.

Receiver rules:
- Maintain `max_pn` and a sliding bitmap for the most recent 4096 packet numbers.
- A packet is outside the window when `pn <= max_pn - 4096` and MUST be dropped.
- A duplicate packet number inside the window MUST be dropped.
- A new higher packet number advances the window; if the jump is `>= 4096`, previous bitmap history is cleared.

## Encoding
- Header: fixed-size little-endian numeric fields.
- Payload: inside AEAD; structure depends on Type.

## Relay carriage (MVP)
- Fabric session packets are carried inside relay `RELAY_DATA` payloads.
- Relay `RELAY_DATA` body is opaque to the relay and contains:
  - full Fabric frame bytes (`FrameHeader` + encrypted payload).
- Relay MUST forward these bytes unchanged; Fabric endpoints perform all parsing,
  anti-replay checks, and decryption.
