import { useEffect, useState } from "react";

import { EmptyState, KeyValueList, Panel, Stat } from "../components/Ui";
import { useDaemonLifecycle } from "../hooks/useDaemonLifecycle";
import { useDiagnostics } from "../hooks/useDiagnostics";
import {
  checkForUpdates,
  exportDiagnosticsBundle,
  openDataDir,
  openLogsDir,
  readDaemonLogTail,
  resetDesktopState,
} from "../lib/tauri";
import { formatBytes } from "../lib/format";
import { useDesktopStore } from "../state/desktop-store";

export function DiagnosticsPage() {
  const { daemonStatus, preferences, preferencesMutation, paths } = useDaemonLifecycle();
  const { diagnosticsQuery, selfCheckQuery, statusQuery } = useDiagnostics();
  const clearDesktopState = useDesktopStore((state) => state.clearDesktopState);
  const pushToast = useDesktopStore((state) => state.pushToast);
  const [logTail, setLogTail] = useState("Loading daemon logs...");
  const [updateSummary, setUpdateSummary] = useState("Not checked yet.");

  useEffect(() => {
    void readDaemonLogTail().then(setLogTail).catch((error: Error) => setLogTail(error.message));
  }, [daemonStatus?.last_started_at_unix_secs]);

  return (
    <div className="page-grid">
      <Panel title="Daemon status" description="Health, runtime posture, and current operator-facing counters.">
        <div className="stat-grid">
          <Stat label="Daemon" value={daemonStatus?.state ?? "starting"} tone={daemonStatus?.healthy ? "good" : "warn"} />
          <Stat label="Peers" value={statusQuery.data?.peer_count ?? 0} />
          <Stat label="Proxy bytes" value={formatBytes(diagnosticsQuery.data?.counters.bytes_proxied_total ?? 0)} />
          <Stat label="Relay reachable" value={diagnosticsQuery.data?.counters.relay_reachable ?? 0} />
        </div>
        {selfCheckQuery.data ? (
          <KeyValueList
            entries={[
              { label: "Self-check", value: selfCheckQuery.data.ok ? "healthy" : "degraded" },
              { label: "DNS mode", value: selfCheckQuery.data.dns_mode },
              {
                label: "Runtime capabilities",
                value: JSON.stringify(selfCheckQuery.data.runtime_capabilities),
              },
            ]}
          />
        ) : null}
      </Panel>

      <Panel title="Logs viewer" description="Local sidecar lifecycle and daemon stderr/stdout log tail.">
        <div className="button-row">
          <button className="secondary-button" onClick={() => void openLogsDir()}>
            Open logs directory
          </button>
          <button className="secondary-button" onClick={() => void openDataDir()}>
            Open data directory
          </button>
        </div>
        <pre className="log-viewer">{logTail}</pre>
      </Panel>

      <Panel title="Paths and build info" description="Data, config, and log locations for support and operator workflows.">
        {paths ? (
          <KeyValueList
            entries={[
              { label: "Config dir", value: paths.config_dir },
              { label: "Data dir", value: paths.data_dir },
              { label: "Log dir", value: paths.log_dir },
              { label: "Desktop state file", value: paths.desktop_state_file },
              { label: "Daemon state file", value: paths.daemon_state_file },
              { label: "Daemon log file", value: paths.daemon_log_file },
            ]}
          />
        ) : (
          <EmptyState title="Paths unavailable" body="The desktop paths command has not returned yet." />
        )}
      </Panel>

      <Panel title="Updater and settings" description="Desktop-only preferences. Resetting here does not delete daemon state.">
        {preferences ? (
          <form
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              void preferencesMutation.mutateAsync(preferences);
            }}
          >
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={preferences.close_to_tray}
                onChange={(event) =>
                  preferencesMutation.mutate({
                    ...preferences,
                    close_to_tray: event.target.checked,
                  })
                }
              />
              <span>Close to tray</span>
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={preferences.autostart_enabled}
                onChange={(event) =>
                  preferencesMutation.mutate({
                    ...preferences,
                    autostart_enabled: event.target.checked,
                  })
                }
              />
              <span>Autostart preference</span>
            </label>
            <label>
              <span>Updater channel</span>
              <select
                value={preferences.updater_channel}
                onChange={(event) =>
                  preferencesMutation.mutate({
                    ...preferences,
                    updater_channel: event.target.value as "stable" | "preview",
                  })
                }
              >
                <option value="stable">stable</option>
                <option value="preview">preview</option>
              </select>
            </label>
          </form>
        ) : null}
        <div className="button-row">
          <button
            className="secondary-button"
            onClick={async () => {
              const result = await checkForUpdates();
              setUpdateSummary(
                result.configured
                  ? result.available
                    ? `Update ${result.version} is available.`
                    : "No update is currently available."
                  : "Updater is not configured for this build.",
              );
            }}
          >
            Check for updates
          </button>
          <button
            className="secondary-button"
            onClick={async () => {
              const result = await exportDiagnosticsBundle();
              pushToast({
                tone: "success",
                title: "Diagnostics bundle exported",
                body: result.bundle_path,
              });
            }}
          >
            Export diagnostics bundle
          </button>
          <button
            className="danger-button"
            onClick={async () => {
              if (
                window.confirm(
                  "Reset local desktop state? This will not delete daemon state or mesh data.",
                )
              ) {
                await resetDesktopState();
                clearDesktopState();
              }
            }}
          >
            Reset desktop state
          </button>
        </div>
        <p className="muted-text">{updateSummary}</p>
      </Panel>
    </div>
  );
}
