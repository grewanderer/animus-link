# Service Layer (MVP)

Expose/Connect provides VPN-like UX without TUN in MVP.

- Expose(service_name, local_addr, policy) publishes a service record in namespace.
- Connect(service_name) opens a stream to that service over Fabric session.

MVP policy: deny-by-default; Expose requires explicit ports/hosts.

Local Link daemon API (versioned):
- `GET /v1/status` -> `{ running, peer_count, path }`
- `POST /v1/invite/create` -> `{ invite }`
- `POST /v1/invite/join` body `{ invite }`
- `POST /v1/expose` body `{ service_name, local_addr, allowed_peers }`
- `POST /v1/connect` body `{ service_name }` -> `{ connection_id, stream_id, local_addr? }`

Full-tunnel control endpoints are specified in `spec/full-tunnel.md`.

API behavior:
- Responses are wrapped with `api_version: "v1"`.
- Errors return stable `error.code` values:
  - `invalid_input`, `not_ready`, `denied`, `not_found`, `conflict`, `internal`, `method_not_allowed`.
- Expose is deny-by-default:
  - `allowed_peers` MUST be explicitly provided and non-empty.
  - Missing or empty allow policy MUST be rejected.
- `invite` values MUST be validated and MUST NOT be logged.
- Relay tokens used by daemon workers MUST be minted as signed v1 tokens
  (see `spec/relay.md`) and MUST NOT be logged.

Public deployment expectations:
- Local API SHOULD bind loopback (`127.0.0.1`) by default.
- Production deployments exposing API beyond loopback MUST use an external authn/authz gateway.
- `connect`/`expose` MUST preserve deny-by-default behavior under all configurations.

Example API usage:
- `GET /v1/status`
- `POST /v1/invite/create`
- `POST /v1/invite/join` with `{ "invite": "..." }`
- `POST /v1/expose` with explicit allow-list:
  - `{ "service_name": "echo", "local_addr": "127.0.0.1:19180", "allowed_peers": ["peer-b"] }`
- `POST /v1/connect` with `{ "service_name": "echo" }`

MVP path semantics:
- If relay is configured, daemon status path reports `"relay"`.
- Without relay configuration, path reports `"unknown"` (direct path is stubbed).
- In relay-first mode, `connect` may return a loopback `local_addr` for local TCP proxying.
