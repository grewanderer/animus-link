# Full Tunnel (Phase 0 Scaffolding)

This document defines the public API and safety/performance requirements for
on-demand full-tunnel exit routing. It is normative for link-daemon control
behavior and future data-plane implementation.

## Architecture
- Client node:
  - Captures IP packets from an OS tunnel interface (TUN/VPN API).
  - Sends opaque IP packets over a Fabric secure session to a selected gateway.
- Relay:
  - Carries encrypted Fabric frames only.
  - NEVER decrypts tunnel payloads.
- Gateway node:
  - Receives tunneled IP packets from Fabric.
  - Performs egress forwarding/NAT to the internet.
  - Returns response packets back through the same encrypted tunnel path.

## Tunnel Inner Payload Schema (inside Fabric mux DATA)
- A dedicated mux stream service name is reserved:
  - `ip-tunnel`
- Tunnel payload frames are encoded as:
  - `version` (`u8`) currently `1`
  - `kind` (`u8`)
  - `len` (`u16`, little-endian)
  - `payload` (`len` bytes)
- Kinds:
  - `IP_PACKET` (`0x01`): raw IPv4 packet bytes
  - `DNS_QUERY` (`0x02`): `{query_id:u16_le, dns_wire_bytes...}`
  - `DNS_RESPONSE` (`0x03`): `{query_id:u16_le, dns_wire_bytes...}`
  - `CONTROL_AUTH` (`0x10`): stream authentication metadata (`peer_id`)
  - `CONTROL_AUTH_OK` (`0x11`)
  - `CONTROL_ERROR` (`0x12`): safe error code only
- Decoder requirements:
  - strict length checking (`len` MUST match payload length)
  - bounded allocation
  - unknown/invalid kinds MUST be rejected safely

Beta caps (defaults):
- `max_ip_packet_bytes`: 2048
- `max_dns_bytes`: 2048
- `max_control_bytes`: 256
- `max_frame_bytes`: 2052

## API Surface (`/v1`)
- `POST /v1/gateway/expose`
  - Request:
    - `mode`: `"exit"` (required)
    - `listen`: socket address string (optional)
    - `nat`: `true` required for exit mode
    - `allowed_peers`: non-empty allow-list (required; deny-by-default)
  - Response:
    - `mode`
    - `gateway_service` (stable service identifier)
    - `nat`
    - `allowed_peer_count`
    - `listen_configured`
- `POST /v1/tunnel/enable`
  - Request:
    - `gateway_service`: string (required)
    - `fail_mode`: `"open_fast"` or `"closed"` (default: `"open_fast"`)
    - `dns_mode`: `"remote_best_effort"` or `"remote_strict"` or `"system"` (default: `"remote_best_effort"`)
    - `exclude_cidrs`: list of CIDRs (optional, default empty)
    - `allow_lan`: bool (optional, default `false`)
- `POST /v1/tunnel/disable`
- `GET /v1/tunnel/status`
  - Response:
    - `enabled`
    - `state` (`disabled|enabling|connecting|connected|degraded|disabling`)
    - `gateway` (optional)
    - `fail_mode`
    - `dns_mode`
    - `dns_capabilities`:
      - `remote_best_effort_supported`
      - `remote_strict_supported`
      - `can_bind_low_port`
      - `can_set_system_dns`
    - `prewarm_state` (`idle|warming|ready|error`)
    - `prewarm_last_error_code` (optional)
    - `connected`
    - `last_error_code` (optional)
    - `bytes_in`, `bytes_out`
    - `handshake_ms` (optional)
    - `reconnects`

## Failure Policy
- Default: `FAIL_OPEN_FAST` (`fail_mode=open_fast`)
  - If tunnel setup fails or drops, client MUST revert to normal routing quickly
    (target <= 2s).
- Optional: `FAIL_CLOSED` (`fail_mode=closed`)
  - If tunnel drops, client SHOULD block non-overlay traffic until restored or
    tunnel is disabled (best-effort, OS-specific).
- Implementations MUST expose deterministic state transitions in tunnel status.
- `degraded` status MUST include safe `last_error_code` values
  (for example: `relay_not_configured`, `fail_open_fast`, `fail_closed_blocked`,
  `dns_strict_bind_failed`, `dns_strict_config_failed`, `dns_best_effort_unavailable`).

## DNS and Routing Safety
- `dns_mode=remote_best_effort` is the unprivileged default for beta and may degrade
  when local DNS cannot be redirected safely.
- `dns_mode=remote_strict` requires Linux capability to bind `127.0.0.1:53` and to
  update system resolver settings; when active, DNS is pinned to the local tunnel
  stub to avoid local resolver leaks.
- `dns_mode=system` allows local resolver behavior explicitly.
- If `remote_strict` cannot be initialized:
  - `fail_mode=open_fast`: revert DNS/routes and degrade with explicit DNS error code.
  - `fail_mode=closed`: keep fail-closed route block active while preserving protected routes.
- Implementations MUST support route exclusions to avoid control-plane loops:
  - relay endpoints
  - token issuer/control-plane endpoints
  - explicitly configured excluded CIDRs

## Security Invariants
- Relay token, invite secret, key material, and payload bytes MUST NOT be logged.
- Relay MUST NOT terminate end-to-end encryption.
- Tunnel traffic MUST remain encrypted end-to-end between client and gateway.
- Expose policy remains deny-by-default (`allowed_peers` required and non-empty).

## Performance Targets (Design Requirements)
- Typical tunnel enable visible as connected in ~300-800ms on healthy relay path.
- Typical reconnect after network change <2s.
- Required control defaults:
  - `connect_timeout_ms`: 800
  - `reconnect_backoff_ms`: start 200, cap 2000
  - failover decision target: <= 2s
- Fast path requirements:
  - relay-first transport
  - session prewarm when gateway is configured:
    - daemon/tunnel runtime maintains a background prewarmed secure session
      (`prewarm_state=warming|ready|error`)
    - `GET /v1/tunnel/status` exposes `prewarm_state` and `prewarm_last_error_code`
  - enable path SHOULD consume a compatible prewarmed session when `prewarm_state=ready`
    and otherwise fall back to a fresh verified handshake (`connect_timeout_ms=800`)
  - session resumption/fast rekey when available
  - open-fast grace window:
    - on transient relay/session drop, allow a short recovery grace window before
      restoring routes (`open_fast_grace_ms=500` default)
    - if not recovered by grace deadline, route/DNS restore MUST proceed within the
      open-fast fail policy target

## Self-check Integration
- `/v1/self_check` MUST include:
  - `tunnel_supported`
  - `tunnel_config_ok`
  - `dns_remote_strict_supported`
- `/v1/self_check` response SHOULD surface:
  - `dns_mode`
  - `dns_capabilities` (`remote_best_effort_supported`, `remote_strict_supported`,
    `can_bind_low_port`, `can_set_system_dns`)
- Responses MUST be redacted and MUST NOT include secrets.
