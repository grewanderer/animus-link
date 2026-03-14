import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface AppPaths {
  config_dir: string;
  data_dir: string;
  cache_dir: string;
  log_dir: string;
  desktop_state_file: string;
  daemon_state_file: string;
  daemon_log_file: string;
}

export interface DesktopPreferences {
  close_to_tray: boolean;
  autostart_enabled: boolean;
  updater_channel: "stable" | "preview";
  device_label: string;
  dev_daemon_binary_path?: string | null;
}

export interface DaemonStatus {
  state: "stopped" | "starting" | "running" | "degraded";
  healthy: boolean;
  api_url: string;
  pid?: number | null;
  sidecar_mode: "dev_override" | "bundled" | "detected_workspace";
  last_error?: string | null;
  last_exit_code?: number | null;
  last_started_at_unix_secs?: number | null;
}

export interface UpdateCheckResult {
  configured: boolean;
  available: boolean;
  version?: string | null;
  body?: string | null;
}

export interface DiagnosticsBundleResult {
  bundle_path: string;
}

export interface DaemonStatusEvent {
  status: DaemonStatus;
}

const defaultPreferences: DesktopPreferences = {
  close_to_tray: true,
  autostart_enabled: false,
  updater_channel: "stable",
  device_label: "This Device",
  dev_daemon_binary_path: null,
};

function isTauriRuntime() {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

function readBrowserPreferences() {
  if (typeof localStorage === "undefined") {
    return defaultPreferences;
  }
  const raw = localStorage.getItem("animus-link-desktop-preferences");
  return raw ? ({ ...defaultPreferences, ...JSON.parse(raw) } as DesktopPreferences) : defaultPreferences;
}

function writeBrowserPreferences(preferences: DesktopPreferences) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("animus-link-desktop-preferences", JSON.stringify(preferences));
  }
}

export async function getAppPaths() {
  if (!isTauriRuntime()) {
    return {
      config_dir: ".animus-link-desktop/config",
      data_dir: ".animus-link-desktop/data",
      cache_dir: ".animus-link-desktop/cache",
      log_dir: ".animus-link-desktop/logs",
      desktop_state_file: ".animus-link-desktop/config/desktop-state.json",
      daemon_state_file: ".animus-link-daemon/state.json",
      daemon_log_file: ".animus-link-daemon/link-daemon.log",
    };
  }
  return invoke<AppPaths>("get_app_paths");
}

export async function getDesktopPreferences() {
  if (!isTauriRuntime()) {
    return readBrowserPreferences();
  }
  return invoke<DesktopPreferences>("get_desktop_preferences");
}

export async function setDesktopPreferences(preferences: DesktopPreferences) {
  if (!isTauriRuntime()) {
    writeBrowserPreferences(preferences);
    return preferences;
  }
  return invoke<DesktopPreferences>("set_desktop_preferences", { preferences });
}

export async function getDaemonStatus() {
  if (!isTauriRuntime()) {
    return {
      state: "running",
      healthy: true,
      api_url: import.meta.env.VITE_DAEMON_URL || "http://127.0.0.1:9999",
      pid: null,
      sidecar_mode: "detected_workspace",
      last_error: null,
      last_exit_code: null,
      last_started_at_unix_secs: Math.floor(Date.now() / 1000),
    } as DaemonStatus;
  }
  return invoke<DaemonStatus>("get_daemon_status");
}

export async function startDaemon() {
  if (!isTauriRuntime()) {
    return getDaemonStatus();
  }
  return invoke<DaemonStatus>("start_daemon");
}

export async function stopDaemon() {
  if (!isTauriRuntime()) {
    return {
      ...(await getDaemonStatus()),
      state: "stopped",
      healthy: false,
    } as DaemonStatus;
  }
  return invoke<DaemonStatus>("stop_daemon");
}

export async function restartDaemon() {
  if (!isTauriRuntime()) {
    return getDaemonStatus();
  }
  return invoke<DaemonStatus>("restart_daemon");
}

export async function openLogsDir() {
  if (!isTauriRuntime()) {
    return;
  }
  return invoke<void>("open_logs_dir");
}

export async function openDataDir() {
  if (!isTauriRuntime()) {
    return;
  }
  return invoke<void>("open_data_dir");
}

export async function readDaemonLogTail(lines = 200) {
  if (!isTauriRuntime()) {
    return `browser-dev mode: no native log tail available (requested ${lines} lines)`;
  }
  return invoke<string>("read_daemon_log_tail", { lines });
}

export async function exportDiagnosticsBundle() {
  if (!isTauriRuntime()) {
    return { bundle_path: "browser-dev-mode.json" };
  }
  return invoke<DiagnosticsBundleResult>("export_diagnostics_bundle");
}

export async function resetDesktopState() {
  if (!isTauriRuntime()) {
    writeBrowserPreferences(defaultPreferences);
    return defaultPreferences;
  }
  return invoke<DesktopPreferences>("reset_desktop_state");
}

export async function checkForUpdates() {
  if (!isTauriRuntime()) {
    return {
      configured: false,
      available: false,
      version: null,
      body: "Updater is only available in the packaged desktop app.",
    };
  }
  return invoke<UpdateCheckResult>("check_for_updates");
}

export async function installUpdate() {
  if (!isTauriRuntime()) {
    return checkForUpdates();
  }
  return invoke<UpdateCheckResult>("install_update");
}

export async function onDaemonStatusEvent(
  handler: (event: DaemonStatusEvent) => void,
) {
  if (!isTauriRuntime()) {
    handler({ status: await getDaemonStatus() });
    return (() => {}) as UnlistenFn;
  }
  return listen<DaemonStatusEvent>("desktop://daemon-status", (event) => {
    handler(event.payload);
  }) as Promise<UnlistenFn>;
}
