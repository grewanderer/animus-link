import { useState } from "react";

import { EmptyState, KeyValueList, Panel, Stat } from "../components/Ui";
import { useMeshes } from "../hooks/useMeshes";
import { usePeers } from "../hooks/usePeers";
import { formatRelativeTime } from "../lib/format";
import { useDesktopStore } from "../state/desktop-store";

export function MeshesPage() {
  const { meshesQuery, activeMesh, createInvite } = useMeshes();
  const { peersQuery, revokePeer } = usePeers(activeMesh?.config.mesh_id);
  const selectMesh = useDesktopStore((state) => state.selectMesh);
  const [inviteText, setInviteText] = useState("");

  const peers = peersQuery.data?.peers ?? [];

  return (
    <div className="page-grid">
      <Panel title="Meshes" description="Operator view of local meshes and mesh membership.">
        <div className="mesh-list">
          {(meshesQuery.data?.meshes ?? []).map((mesh) => (
            <button
              key={mesh.config.mesh_id}
              className={
                activeMesh?.config.mesh_id === mesh.config.mesh_id
                  ? "mesh-tile mesh-tile-active"
                  : "mesh-tile"
              }
              onClick={() => selectMesh(mesh.config.mesh_id)}
            >
              <strong>{mesh.config.mesh_name}</strong>
              <span>{mesh.config.mesh_id}</span>
              <small>
                {mesh.peer_count} peers / {mesh.relay_count} relays / {mesh.service_count} services
              </small>
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        title="Invite peer"
        description="Create an invite for the selected mesh and copy/share it through your operator channel."
        actions={
          <button
            className="secondary-button"
            disabled={!activeMesh}
            onClick={async () => {
              if (!activeMesh) {
                return;
              }
              const result = await createInvite.mutateAsync(activeMesh.config.mesh_id);
              setInviteText(result.invite);
            }}
          >
            Create invite
          </button>
        }
      >
        {inviteText ? (
          <label className="stack-form">
            <span>Invite payload</span>
            <textarea value={inviteText} readOnly />
          </label>
        ) : (
          <EmptyState
            title="No invite created yet"
            body="Generate an invite from the currently selected mesh to share onboarding credentials."
          />
        )}
      </Panel>

      <Panel title="Mesh details" description="Local mesh and node status pulled directly from the daemon.">
        {activeMesh ? (
          <>
            <div className="stat-grid">
              <Stat label="Peers" value={activeMesh.peer_count} />
              <Stat label="Relays" value={activeMesh.relay_count} />
              <Stat label="Services" value={activeMesh.service_count} />
            </div>
            <KeyValueList
              entries={[
                { label: "Mesh id", value: activeMesh.config.mesh_id },
                { label: "Local node", value: activeMesh.config.local_node_id },
                { label: "Local device", value: activeMesh.config.local_device_id },
                { label: "Created by", value: activeMesh.config.created_by_peer_id },
              ]}
            />
          </>
        ) : (
          <EmptyState title="No mesh selected" body="Create or join a mesh first." />
        )}
      </Panel>

      <Panel title="Peers" description="Peer trust, routing eligibility, node role visibility, and revoke controls.">
        {peers.length === 0 ? (
          <EmptyState title="No peers" body="The selected mesh has no remote peers yet." />
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Peer</th>
                  <th>Node</th>
                  <th>Roles</th>
                  <th>Trust</th>
                  <th>Online</th>
                  <th>Last seen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {peers.map((peer) => (
                  <tr key={peer.peer_id}>
                    <td>{peer.peer_id}</td>
                    <td>{peer.node_id}</td>
                    <td>{peer.roles.join(", ") || "edge"}</td>
                    <td>{peer.trust}</td>
                    <td>{peer.online ? "online" : "offline"}</td>
                    <td>{formatRelativeTime(peer.last_seen_unix_secs)}</td>
                    <td>
                      {peer.peer_id !== activeMesh?.config.local_root_identity_id ? (
                        <button
                          className="danger-button"
                          onClick={() => {
                            if (
                              activeMesh &&
                              window.confirm(
                                `Revoke ${peer.peer_id}? This blocks service and messenger access.`,
                              )
                            ) {
                              void revokePeer.mutateAsync(peer.peer_id);
                            }
                          }}
                        >
                          Revoke
                        </button>
                      ) : (
                        <span className="muted-text">local</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
