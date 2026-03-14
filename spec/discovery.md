# Discovery (Mesh MVP)

Default is **invite-first private meshes**.

Mesh lifecycle:
- A mesh is created locally through Link daemon control APIs.
- A mesh invite is scoped to one mesh and MUST carry:
  - `mesh_id`
  - inviter `peer_id`
  - inviter `node_id`
  - invite secret
  - expiry time
- Mesh peers are visible only inside the mesh.
- Joining a mesh creates a local membership record and imports the inviter peer record.

Identity and membership records:
- `peer_id` is the stable root identity reference for a participant.
- `device_id` is the device-scoped identity reference.
- `node_id` is the currently active connectivity node identity.
- Membership records MUST include:
  - `mesh_id`
  - `peer_id`
  - `device_id`
  - `node_id`
  - `roles`
  - `trust`
  - `joined_at_unix_secs`
  - optional `revoked_at_unix_secs`
  - deterministic membership signature / record digest

Role-scoped discovery:
- Any node MAY advertise relay capability inside a mesh after it has the `relay` role.
- Relay advertisements are mesh-scoped by default and MUST NOT become globally visible unless explicitly configured.
- Managed relays are optional external infrastructure and are never the source of peer identity semantics.

Signed announcements:
- Nodes MAY publish short-lived signed announcements with:
  - `mesh_id`
  - `node_id`
  - endpoints (transport type + addr)
  - `expires_at`
  - signature
- The signed form MUST be deterministic.
- Relay and discovery transports MUST NOT weaken Fabric end-to-end secrecy.

Public DHT mode remains out-of-scope for MVP unless explicitly enabled.
