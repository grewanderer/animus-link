# Service Layer (Mesh-Native MVP)

Animus Link is layered as:

Animus Identity / Mesh / Relay / Service substrate
  -> Messenger
  -> optional app adapters such as RustDesk
  -> future app-specific adapters

The service layer is app-agnostic and L4-first:
- Expose publishes a local service into a private mesh.
- Connect creates a local listener / binding that forwards through a Fabric secure session to the selected remote service.
- Messenger MUST reuse the same identity, routing, relay, and binding substrate.

Routing policy:
- Default mode is direct-first, relay-second.
- Users MAY pin a preferred relay node for a peer, service, or conversation.
- Users MAY force relay mode for a target.
- Managed relay is optional and only used when policy allows it.
- Route selection MUST emit decision logs explaining why the path was chosen.

Primary local Link daemon API (`/v1`):
- `POST /meshes`
- `GET /meshes`
- `POST /meshes/{mesh_id}/invite`
- `POST /meshes/join`
- `GET /meshes/{mesh_id}/peers`
- `POST /meshes/{mesh_id}/peers/{peer_id}/revoke`
- `POST /nodes/{node_id}/roles`
- `GET /nodes/{node_id}/roles`
- `POST /relays/advertise`
- `POST /relays/select`
- `POST /relays/clear-selection`
- `GET /relays/status`
- `POST /services/expose`
- `POST /services/connect`
- `GET /services`
- `DELETE /services/{service_id}`
- `GET /routing/decision-log`
- `GET /routing/status`
- `POST /messenger/conversations`
- `GET /messenger/conversations`
- `POST /messenger/send`
- `GET /messenger/stream`
- `GET /messenger/presence`
- Optional adapter endpoint:
  - `POST /apps/rustdesk/bind`
  - `DELETE /apps/rustdesk/bind/{binding_id}`

Legacy compatibility aliases MAY be kept for local tooling:
- `POST /invite/create`
- `POST /invite/join`
- `POST /expose`
- `POST /connect`

API behavior:
- Responses are wrapped with `api_version: "v1"`.
- Errors return stable `error.code` values:
  - `invalid_input`, `not_ready`, `denied`, `not_found`, `conflict`, `internal`, `method_not_allowed`.
- Expose is deny-by-default:
  - `allowed_peers` MUST be explicitly provided and non-empty.
  - Missing or empty allow policy MUST be rejected.
- `invite` values MUST be validated and MUST NOT be logged.
- Relay tokens used by daemon workers MUST be minted as signed v1 tokens (see `spec/relay.md`) and MUST NOT be logged.
- Relay nodes forward encrypted Fabric payload only and MUST NOT terminate end-to-end secrecy.

Messenger substrate expectations:
- Conversations are mesh-scoped.
- Messages carry routing decisions from the same routing policy engine used by service connect.
- Attachment or control channels MUST be represented as service / binding usage, not a parallel networking stack.

Public deployment expectations:
- Local API SHOULD bind loopback (`127.0.0.1`) by default.
- Production deployments exposing API beyond loopback MUST use an external authn/authz gateway.
- `connect` / `expose` MUST preserve deny-by-default behavior under all configurations.
- No mandatory cloud control plane is required for private mesh operation.
