import { useState } from "react";

import { EmptyState, KeyValueList, Panel, Stat } from "../components/Ui";
import { useDaemonLifecycle } from "../hooks/useDaemonLifecycle";
import { useMeshes } from "../hooks/useMeshes";
import { useDesktopStore } from "../state/desktop-store";

export function OnboardingPage() {
  const { daemonStatus, preferences, preferencesMutation, startMutation } =
    useDaemonLifecycle();
  const { meshesQuery, createMesh, joinMesh } = useMeshes();
  const [meshName, setMeshName] = useState("");
  const [deviceLabel, setDeviceLabel] = useState(preferences?.device_label ?? "");
  const [invite, setInvite] = useState("");
  const [bootstrapUrl, setBootstrapUrl] = useState("");

  const meshes = meshesQuery.data?.meshes ?? [];
  const localIdentity = meshes[0]?.config;
  const selectedMeshId = useDesktopStore((state) => state.selectedMeshId);

  return (
    <div className="page-grid">
      <Panel
        title="First-run operator setup"
        description="The desktop shell starts and supervises the local daemon, but all mesh state remains in the daemon."
      >
        <div className="stat-grid">
          <Stat label="Daemon state" value={daemonStatus?.state ?? "starting"} tone={daemonStatus?.healthy ? "good" : "warn"} />
          <Stat label="Known meshes" value={meshes.length} />
          <Stat label="Selected mesh" value={selectedMeshId ?? "none"} />
        </div>
        {!daemonStatus?.healthy ? (
          <EmptyState
            title="Daemon not ready"
            body="Start or recover the sidecar before onboarding. The app will retry automatically."
            action={
              <button
                className="primary-button"
                onClick={() => void startMutation.mutateAsync()}
              >
                Start daemon
              </button>
            }
          />
        ) : null}
      </Panel>

      <Panel title="Create mesh" description="Bootstrap a new private mesh from this device.">
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createMesh.mutateAsync(meshName || undefined);
          }}
        >
          <label>
            <span>Mesh name</span>
            <input value={meshName} onChange={(event) => setMeshName(event.target.value)} />
          </label>
          <button className="primary-button" type="submit">
            Create mesh
          </button>
        </form>
      </Panel>

      <Panel title="Join with invite" description="Join another peer using an invite and bootstrap URL.">
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            void joinMesh.mutateAsync({ invite, bootstrap_url: bootstrapUrl });
          }}
        >
          <label>
            <span>Invite</span>
            <textarea value={invite} onChange={(event) => setInvite(event.target.value)} />
          </label>
          <label>
            <span>Bootstrap URL</span>
            <input
              placeholder="http://127.0.0.1:9999"
              value={bootstrapUrl}
              onChange={(event) => setBootstrapUrl(event.target.value)}
            />
          </label>
          <button className="primary-button" type="submit">
            Join mesh
          </button>
        </form>
      </Panel>

      <Panel title="Desktop identity" description="This device label is local desktop metadata only; daemon identities remain authoritative.">
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!preferences) {
              return;
            }
            void preferencesMutation.mutateAsync({
              ...preferences,
              device_label: deviceLabel,
            });
          }}
        >
          <label>
            <span>Device label</span>
            <input
              value={deviceLabel}
              onChange={(event) => setDeviceLabel(event.target.value)}
            />
          </label>
          <button className="secondary-button" type="submit">
            Save label
          </button>
        </form>
        {localIdentity ? (
          <KeyValueList
            entries={[
              { label: "Local root identity", value: localIdentity.local_root_identity_id },
              { label: "Local device id", value: localIdentity.local_device_id },
              { label: "Local node id", value: localIdentity.local_node_id },
              { label: "API URL", value: daemonStatus?.api_url ?? "pending" },
            ]}
          />
        ) : (
          <EmptyState
            title="No mesh identity yet"
            body="Create or join a mesh to populate local node identity details from the daemon."
          />
        )}
      </Panel>
    </div>
  );
}
