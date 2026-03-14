use anyhow::Result;
use tauri::{AppHandle, State};

use crate::sidecar::{
    AppPaths, DaemonStatus, DesktopAppState, DesktopPreferences, DiagnosticsBundleResult,
    UpdateCheckResult,
};

#[tauri::command]
pub async fn get_app_paths(state: State<'_, DesktopAppState>) -> Result<AppPaths, String> {
    Ok(state.app_paths().await)
}

#[tauri::command]
pub async fn get_desktop_preferences(
    state: State<'_, DesktopAppState>,
) -> Result<DesktopPreferences, String> {
    Ok(state.preferences().await)
}

#[tauri::command]
pub async fn set_desktop_preferences(
    state: State<'_, DesktopAppState>,
    preferences: DesktopPreferences,
) -> Result<DesktopPreferences, String> {
    state
        .set_preferences(preferences)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn reset_desktop_state(
    state: State<'_, DesktopAppState>,
) -> Result<DesktopPreferences, String> {
    state
        .reset_preferences()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_daemon_status(state: State<'_, DesktopAppState>) -> Result<DaemonStatus, String> {
    state
        .daemon_status()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn start_daemon(
    app: AppHandle,
    state: State<'_, DesktopAppState>,
) -> Result<DaemonStatus, String> {
    state
        .start_daemon(&app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn stop_daemon(
    app: AppHandle,
    state: State<'_, DesktopAppState>,
) -> Result<DaemonStatus, String> {
    state
        .stop_daemon(&app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn restart_daemon(
    app: AppHandle,
    state: State<'_, DesktopAppState>,
) -> Result<DaemonStatus, String> {
    state
        .restart_daemon(&app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn open_logs_dir(state: State<'_, DesktopAppState>) -> Result<(), String> {
    state
        .open_logs_dir()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn open_data_dir(state: State<'_, DesktopAppState>) -> Result<(), String> {
    state
        .open_data_dir()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn read_daemon_log_tail(
    state: State<'_, DesktopAppState>,
    lines: Option<usize>,
) -> Result<String, String> {
    state
        .read_daemon_log_tail(lines.unwrap_or(200))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn export_diagnostics_bundle(
    state: State<'_, DesktopAppState>,
) -> Result<DiagnosticsBundleResult, String> {
    state
        .export_diagnostics_bundle()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn check_for_updates(
    state: State<'_, DesktopAppState>,
) -> Result<UpdateCheckResult, String> {
    state
        .check_for_updates()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn install_update(
    state: State<'_, DesktopAppState>,
) -> Result<UpdateCheckResult, String> {
    state
        .install_update()
        .await
        .map_err(|error| error.to_string())
}
