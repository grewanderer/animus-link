import { useMemo, useState } from "react";

import { EmptyState, Panel } from "../components/Ui";
import { useMeshes } from "../hooks/useMeshes";
import { usePeers } from "../hooks/usePeers";
import { useRelayStatus } from "../hooks/useRelayStatus";
import { explainDecisionReason } from "../lib/routing";

export function RelayPage() {
  const { activeMesh } = useMeshes();
  const { peersQuery } = usePeers(activeMesh?.config.mesh_id);
  const {
    relayStatusQuery,
    routingStatusQuery,
    decisionLogQuery,
    advertiseRelay,
    selectRelay,
    clearRelay,
  } = useRelayStatus(activeMesh?.config.mesh_id);

  const [tags, setTags] = useState("mesh");
  const [targetKind, setTargetKind] = useState("service");
  const [targetId, setTargetId] = useState("");
  const [relayNodeId, setRelayNodeId] = useState("");
  const [forced, setForced] = useState(false);

  const relayPeers = useMemo(
    () =>
      (peersQuery.data?.peers ?? []).filter((peer) => peer.roles.includes("relay")),
    [peersQuery.data?.peers],
  );

  return (
    <div className="page-grid">
      <Panel title="Advertise this node as relay" description="Expose the local node as a peer-selectable relay inside the selected mesh.">
        {!activeMesh ? (
          <EmptyState title="No mesh selected" body="Select a mesh before advertising relay capacity." />
        ) : (
          <form
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              void advertiseRelay.mutateAsync({
                forced_only: forced,
                tags: tags.split(",").map((value) => value.trim()).filter(Boolean),
              });
            }}
          >
            <label>
              <span>Tags</span>
              <input value={tags} onChange={(event) => setTags(event.target.value)} />
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={forced}
                onChange={(event) => setForced(event.target.checked)}
              />
              <span>Forced-relay only</span>
            </label>
            <button className="primary-button" type="submit">
              Advertise relay
            </button>
          </form>
        )}
      </Panel>

      <Panel title="Relay policy" description="Pin preferred relays, clear selections, and force relay routing for a target.">
        {!activeMesh ? (
          <EmptyState title="No mesh selected" body="Select a mesh to edit relay policy." />
        ) : (
          <form
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              void selectRelay.mutateAsync({
                target_kind: targetKind as "service" | "peer" | "conversation" | "adapter",
                target_id: targetId,
                relay_node_id: relayNodeId,
                forced,
              });
            }}
          >
            <label>
              <span>Target kind</span>
              <select value={targetKind} onChange={(event) => setTargetKind(event.target.value)}>
                <option value="service">service</option>
                <option value="conversation">conversation</option>
                <option value="peer">peer</option>
                <option value="adapter">adapter</option>
              </select>
            </label>
            <label>
              <span>Target id</span>
              <input value={targetId} onChange={(event) => setTargetId(event.target.value)} />
            </label>
            <label>
              <span>Relay node id</span>
              <input
                value={relayNodeId}
                onChange={(event) => setRelayNodeId(event.target.value)}
                list="relay-nodes"
              />
              <datalist id="relay-nodes">
                {relayPeers.map((peer) => (
                  <option key={peer.node_id} value={peer.node_id}>
                    {peer.peer_id}
                  </option>
                ))}
              </datalist>
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={forced}
                onChange={(event) => setForced(event.target.checked)}
              />
              <span>Force relay</span>
            </label>
            <div className="button-row">
              <button className="primary-button" type="submit">
                Save relay policy
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  void clearRelay.mutateAsync({
                    target_kind: targetKind as "service" | "peer" | "conversation" | "adapter",
                    target_id: targetId,
                  })
                }
              >
                Clear selection
              </button>
            </div>
          </form>
        )}
      </Panel>

      <Panel title="Relay inventory" description="Relay offers and policy selections visible to this daemon.">
        {(relayStatusQuery.data?.offers.length ?? 0) === 0 ? (
          <EmptyState title="No relay offers" body="Promote a node to relay and advertise it before pinning traffic through it." />
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Peer</th>
                  <th>Tags</th>
                  <th>Forced only</th>
                </tr>
              </thead>
              <tbody>
                {relayStatusQuery.data?.offers.map((offer) => (
                  <tr key={offer.relay_id}>
                    <td>{offer.node_id}</td>
                    <td>{offer.peer_id}</td>
                    <td>{offer.tags.join(", ") || "none"}</td>
                    <td>{offer.forced_only ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Effective routing" description="Operator-friendly view of current route outcomes and why the daemon chose them.">
        <div className="stack-list">
          {(routingStatusQuery.data?.active_connections ?? []).map((connection) => (
            <article key={connection.connection_id} className="event-card">
              <strong>
                {connection.target_kind}:{connection.target_id}
              </strong>
              <p>
                route={connection.route_path}
                {connection.selected_relay_node_id
                  ? ` via ${connection.selected_relay_node_id}`
                  : ""}
              </p>
            </article>
          ))}
          {(decisionLogQuery.data?.decisions ?? []).slice(0, 8).map((decision) => (
            <article key={decision.decision_id} className="event-card">
              <strong>
                {decision.target_kind}:{decision.target_id}
              </strong>
              <p>
                chosen={decision.chosen_path}
                {decision.selected_relay_node_id
                  ? ` / relay=${decision.selected_relay_node_id}`
                  : ""}
              </p>
              <small>{explainDecisionReason(decision.reason)}</small>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
