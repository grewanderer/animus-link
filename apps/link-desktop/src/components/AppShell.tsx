import { NavLink, Outlet } from "react-router-dom";

import { useDaemonLifecycle } from "../hooks/useDaemonLifecycle";
import { formatRelativeTime } from "../lib/format";
import { openLogsDir } from "../lib/tauri";
import { useDesktopStore } from "../state/desktop-store";

const nav = [
  { to: "/onboarding", label: "Onboarding" },
  { to: "/meshes", label: "Meshes" },
  { to: "/relay", label: "Relay" },
  { to: "/services", label: "Services" },
  { to: "/messenger", label: "Messenger" },
  { to: "/diagnostics", label: "Diagnostics" },
];

function StatusBar() {
  const { daemonStatus } = useDaemonLifecycle();
  const activeMeshId = useDesktopStore((state) => state.selectedMeshId);

  return (
    <header className="status-bar">
      <div>
        <span className={`pill pill-${daemonStatus?.healthy ? "good" : "warn"}`}>
          {daemonStatus?.healthy ? "Daemon healthy" : "Degraded"}
        </span>
      </div>
      <div className="status-bar-meta">
        <span>Mesh: {activeMeshId ?? "none"}</span>
        <span>Mode: {daemonStatus?.sidecar_mode ?? "pending"}</span>
        <span>
          Started: {formatRelativeTime(daemonStatus?.last_started_at_unix_secs ?? undefined)}
        </span>
      </div>
      <button className="ghost-button" onClick={() => void openLogsDir()}>
        Open logs
      </button>
    </header>
  );
}

function ToastViewport() {
  const toasts = useDesktopStore((state) => state.toasts);
  const dismissToast = useDesktopStore((state) => state.dismissToast);

  return (
    <div className="toast-viewport">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className={`toast toast-${toast.tone}`}
          onClick={() => dismissToast(toast.id)}
        >
          <strong>{toast.title}</strong>
          {toast.body ? <span>{toast.body}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function AppShell() {
  const { daemonStatus, restartMutation } = useDaemonLifecycle();

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">AL</span>
          <div>
            <strong>Animus Link</strong>
            <p>Desktop operator console</p>
          </div>
        </div>
        <nav className="nav-list">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? "nav-link nav-link-active" : "nav-link"
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          className="primary-button sidebar-button"
          onClick={() => void restartMutation.mutateAsync()}
        >
          Restart daemon
        </button>
      </aside>
      <main className="workspace">
        {!daemonStatus?.healthy ? (
          <div className="banner">
            <div>
              <strong>Sidecar unhealthy</strong>
              <p>
                The desktop shell will keep retrying. Mesh state remains in the daemon; restarting
                only affects the local sidecar process.
              </p>
            </div>
            <button className="secondary-button" onClick={() => void restartMutation.mutateAsync()}>
              Recover
            </button>
          </div>
        ) : null}
        <StatusBar />
        <Outlet />
      </main>
      <ToastViewport />
    </div>
  );
}
