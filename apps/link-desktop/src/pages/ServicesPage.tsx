import { useMemo, useState } from "react";

import { EmptyState, Panel, Stat } from "../components/Ui";
import { useMeshes } from "../hooks/useMeshes";
import { usePeers } from "../hooks/usePeers";
import { useServices } from "../hooks/useServices";
import { formatBytes, formatRelativeTime } from "../lib/format";

export function ServicesPage() {
  const { activeMesh } = useMeshes();
  const { peersQuery } = usePeers(activeMesh?.config.mesh_id);
  const { servicesQuery, routingStatusQuery, diagnosticsQuery, exposeService, connectService, deleteService } =
    useServices(activeMesh?.config.mesh_id);
  const [serviceName, setServiceName] = useState("");
  const [localAddr, setLocalAddr] = useState("127.0.0.1:8080");
  const [allowedPeers, setAllowedPeers] = useState("");
  const [connectTarget, setConnectTarget] = useState("");

  const services = servicesQuery.data?.services ?? [];
  const bindings = servicesQuery.data?.bindings ?? [];
  const activeConnections = routingStatusQuery.data?.active_connections ?? [];
  const globalBytes = diagnosticsQuery.data?.counters.bytes_proxied_total ?? 0;
  const peerIds = useMemo(
    () => (peersQuery.data?.peers ?? []).map((peer) => peer.peer_id),
    [peersQuery.data?.peers],
  );

  return (
    <div className="page-grid">
      <Panel title="Service health" description="Exposed services, bindings, active routing, and current proxy volume from the daemon.">
        <div className="stat-grid">
          <Stat label="Services" value={services.length} />
          <Stat label="Bindings" value={bindings.length} />
          <Stat label="Active connections" value={activeConnections.length} />
          <Stat label="Bytes proxied" value={formatBytes(globalBytes)} tone="good" />
        </div>
      </Panel>

      <Panel title="Expose service" description="Publish a service into the mesh without moving any service-plane logic into the desktop shell.">
        {!activeMesh ? (
          <EmptyState title="No mesh selected" body="Select a mesh to expose a service." />
        ) : (
          <form
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              void exposeService.mutateAsync({
                service_name: serviceName,
                local_addr: localAddr,
                allowed_peers: allowedPeers.split(",").map((value) => value.trim()).filter(Boolean),
                tags: [],
              });
            }}
          >
            <label>
              <span>Service name</span>
              <input value={serviceName} onChange={(event) => setServiceName(event.target.value)} />
            </label>
            <label>
              <span>Local target</span>
              <input value={localAddr} onChange={(event) => setLocalAddr(event.target.value)} />
            </label>
            <label>
              <span>Allowed peers</span>
              <input
                list="service-peers"
                value={allowedPeers}
                onChange={(event) => setAllowedPeers(event.target.value)}
              />
              <datalist id="service-peers">
                {peerIds.map((peerId) => (
                  <option key={peerId} value={peerId} />
                ))}
              </datalist>
            </label>
            <button className="primary-button" type="submit">
              Expose service
            </button>
          </form>
        )}
      </Panel>

      <Panel title="Connect service" description="Open a service connection and inspect the effective route that the daemon selected.">
        {!activeMesh ? (
          <EmptyState title="No mesh selected" body="Select a mesh before connecting to a service." />
        ) : (
          <form
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              void connectService.mutateAsync({ service_name: connectTarget });
            }}
          >
            <label>
              <span>Service selector</span>
              <input
                list="service-names"
                value={connectTarget}
                onChange={(event) => setConnectTarget(event.target.value)}
              />
              <datalist id="service-names">
                {services.map((service) => (
                  <option key={service.service_id} value={service.service_name} />
                ))}
              </datalist>
            </label>
            <button className="primary-button" type="submit">
              Connect service
            </button>
            {connectService.data ? (
              <div className="callout">
                <strong>Connect result</strong>
                <p>local listener: {connectService.data.local_addr ?? "inline"}</p>
                <p>route: {connectService.data.route_path ?? "unknown"}</p>
                <p>relay: {connectService.data.selected_relay_node_id ?? "none"}</p>
              </div>
            ) : null}
          </form>
        )}
      </Panel>

      <Panel title="Published services" description="Service ACLs, trust indicators, target visibility, and delete controls.">
        {services.length === 0 ? (
          <EmptyState title="No services" body="Expose a service to populate the service catalog." />
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Owner</th>
                  <th>Target</th>
                  <th>Trust</th>
                  <th>Allowed peers</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.service_id}>
                    <td>{service.service_name}</td>
                    <td>{service.owner_peer_id}</td>
                    <td>{service.local_addr}</td>
                    <td>{service.trust}</td>
                    <td>{service.allowed_peers.join(", ") || "owner only"}</td>
                    <td>
                      <button
                        className="danger-button"
                        onClick={() => {
                          if (window.confirm(`Delete service ${service.service_name}?`)) {
                            void deleteService.mutateAsync(service.service_id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Bindings" description="Current consumer bindings and local listener visibility.">
        {bindings.length === 0 ? (
          <EmptyState title="No bindings" body="Connections will appear here after service connect operations." />
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Binding</th>
                  <th>Service</th>
                  <th>Local listener</th>
                  <th>Route mode</th>
                  <th>Relay</th>
                  <th>State</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {bindings.map((binding) => (
                  <tr key={binding.binding_id}>
                    <td>{binding.binding_id}</td>
                    <td>{binding.service_name}</td>
                    <td>{binding.local_listener ?? "ephemeral"}</td>
                    <td>{binding.route_mode}</td>
                    <td>{binding.selected_relay_node_id ?? "none"}</td>
                    <td>{binding.state}</td>
                    <td>{formatRelativeTime(binding.created_at_unix_secs)}</td>
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
