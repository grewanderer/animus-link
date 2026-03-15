use std::{
    env,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    net::{SocketAddr, TcpListener},
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tokio::{net::TcpStream, process::Command, sync::Mutex, time::sleep};

const STATUS_EVENT: &str = "desktop://daemon-status";
const HEALTH_PATH: &str = "/v1/health";
const DAEMON_START_TIMEOUT_MS: u64 = 8_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppPaths {
    pub config_dir: String,
    pub data_dir: String,
    pub cache_dir: String,
    pub log_dir: String,
    pub desktop_state_file: String,
    pub daemon_state_file: String,
    pub daemon_log_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SidecarMode {
    DevOverride,
    Bundled,
    DetectedWorkspace,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopPreferences {
    pub close_to_tray: bool,
    pub autostart_enabled: bool,
    pub updater_channel: String,
    pub device_label: String,
    pub dev_daemon_binary_path: Option<String>,
}

impl Default for DesktopPreferences {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            autostart_enabled: false,
            updater_channel: "stable".to_string(),
            device_label: hostname_guess(),
            dev_daemon_binary_path: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonStatus {
    pub state: String,
    pub healthy: bool,
    pub api_url: String,
    pub pid: Option<u32>,
    pub sidecar_mode: SidecarMode,
    pub last_error: Option<String>,
    pub last_exit_code: Option<i32>,
    pub last_started_at_unix_secs: Option<u64>,
}

impl Default for DaemonStatus {
    fn default() -> Self {
        Self {
            state: "stopped".to_string(),
            healthy: false,
            api_url: "http://127.0.0.1:9999".to_string(),
            pid: None,
            sidecar_mode: SidecarMode::DetectedWorkspace,
            last_error: None,
            last_exit_code: None,
            last_started_at_unix_secs: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheckResult {
    pub configured: bool,
    pub available: bool,
    pub version: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticsBundleResult {
    pub bundle_path: String,
}

#[derive(Debug)]
struct DesktopRuntime {
    paths: AppPaths,
    preferences: DesktopPreferences,
    status: DaemonStatus,
}

#[derive(Clone)]
pub struct DesktopAppState {
    inner: Arc<Mutex<DesktopRuntime>>,
}

impl DesktopAppState {
    pub fn load(app: &AppHandle) -> Result<Self> {
        let paths = resolve_app_paths(app)?;
        ensure_parent_dir(Path::new(paths.desktop_state_file.as_str()))?;
        ensure_parent_dir(Path::new(paths.daemon_state_file.as_str()))?;
        ensure_parent_dir(Path::new(paths.daemon_log_file.as_str()))?;
        let preferences = load_preferences(Path::new(paths.desktop_state_file.as_str()))?;

        Ok(Self {
            inner: Arc::new(Mutex::new(DesktopRuntime {
                paths,
                preferences,
                status: DaemonStatus::default(),
            })),
        })
    }

    pub async fn app_paths(&self) -> AppPaths {
        self.inner.lock().await.paths.clone()
    }

    pub async fn preferences(&self) -> DesktopPreferences {
        self.inner.lock().await.preferences.clone()
    }

    pub async fn set_preferences(
        &self,
        preferences: DesktopPreferences,
    ) -> Result<DesktopPreferences> {
        let mut inner = self.inner.lock().await;
        inner.preferences = preferences.clone();
        persist_preferences(
            Path::new(inner.paths.desktop_state_file.as_str()),
            inner.preferences.clone(),
        )?;
        Ok(preferences)
    }

    pub async fn reset_preferences(&self) -> Result<DesktopPreferences> {
        self.set_preferences(DesktopPreferences::default()).await
    }

    pub async fn daemon_status(&self) -> Result<DaemonStatus> {
        let mut inner = self.inner.lock().await;
        if inner.status.pid.is_some() {
            inner.status.healthy = health_check(inner.status.api_url.as_str()).await;
            inner.status.state = if inner.status.healthy {
                "running".to_string()
            } else {
                "degraded".to_string()
            };
        }
        Ok(inner.status.clone())
    }

    pub async fn start_daemon(&self, app: &AppHandle) -> Result<DaemonStatus> {
        {
            let status = self.daemon_status().await?;
            if status.pid.is_some() && status.healthy {
                return Ok(status);
            }
        }

        let (paths, preferences) = {
            let inner = self.inner.lock().await;
            (inner.paths.clone(), inner.preferences.clone())
        };
        let api_port = reserve_loopback_port()?;
        let api_url = format!("http://127.0.0.1:{api_port}");
        let (binary_path, sidecar_mode) = resolve_daemon_binary(app, &preferences)?;

        let mut stdout_log = open_log_file(Path::new(paths.daemon_log_file.as_str()))?;
        writeln!(
            stdout_log,
            "[desktop] spawning sidecar path={} api_url={} mode={:?}",
            binary_path.display(),
            api_url,
            sidecar_mode
        )?;
        let stderr_log = stdout_log.try_clone()?;

        let mut child = Command::new(binary_path.as_os_str());
        child
            .arg("--api-bind")
            .arg(format!("127.0.0.1:{api_port}"))
            .arg("--state-file")
            .arg(paths.daemon_state_file.as_str())
            .stdout(Stdio::from(stdout_log))
            .stderr(Stdio::from(stderr_log));

        let mut child = child
            .spawn()
            .context("failed to spawn link-daemon sidecar")?;
        let pid = child.id();
        {
            let mut inner = self.inner.lock().await;
            inner.status = DaemonStatus {
                state: "starting".to_string(),
                healthy: false,
                api_url: api_url.clone(),
                pid,
                sidecar_mode: sidecar_mode.clone(),
                last_error: None,
                last_exit_code: None,
                last_started_at_unix_secs: Some(now_unix_secs()),
            };
        }
        self.emit_status(app).await?;

        let state = self.clone();
        let app_handle = app.clone();
        let pid_for_monitor = pid;
        tauri::async_runtime::spawn(async move {
            let exit_code = child.wait().await.ok().and_then(|status| status.code());
            if let Some(pid) = pid_for_monitor {
                let _ = state.mark_exited(&app_handle, pid, exit_code).await;
            }
        });

        let started = wait_for_health(api_url.as_str()).await;
        let mut inner = self.inner.lock().await;
        inner.status.healthy = started;
        inner.status.state = if started {
            "running".to_string()
        } else {
            "degraded".to_string()
        };
        if !started {
            inner.status.last_error =
                Some("daemon failed readiness probe on local API".to_string());
        }
        let status = inner.status.clone();
        drop(inner);
        self.emit_status(app).await?;
        Ok(status)
    }

    pub async fn stop_daemon(&self, app: &AppHandle) -> Result<DaemonStatus> {
        let pid = { self.inner.lock().await.status.pid };
        if let Some(pid) = pid {
            terminate_process(pid).await?;
        }
        let mut inner = self.inner.lock().await;
        inner.status.state = "stopped".to_string();
        inner.status.healthy = false;
        inner.status.pid = None;
        let status = inner.status.clone();
        drop(inner);
        self.emit_status(app).await?;
        Ok(status)
    }

    pub async fn restart_daemon(&self, app: &AppHandle) -> Result<DaemonStatus> {
        let _ = self.stop_daemon(app).await;
        sleep(Duration::from_millis(300)).await;
        self.start_daemon(app).await
    }

    pub async fn read_daemon_log_tail(&self, lines: usize) -> Result<String> {
        let path = { self.inner.lock().await.paths.daemon_log_file.clone() };
        read_tail(Path::new(path.as_str()), lines)
    }

    pub async fn export_diagnostics_bundle(&self) -> Result<DiagnosticsBundleResult> {
        let (paths, status) = {
            let inner = self.inner.lock().await;
            (inner.paths.clone(), inner.status.clone())
        };

        let bundle_path = Path::new(paths.log_dir.as_str())
            .join(format!("diagnostics-bundle-{}.json", now_unix_secs()));
        let endpoints = [
            "/v1/health",
            "/v1/status",
            "/v1/self_check",
            "/v1/diagnostics",
            "/v1/meshes",
            "/v1/services",
            "/v1/routing/status",
            "/v1/messenger/stream",
        ];
        let mut endpoint_payloads = serde_json::Map::new();
        for endpoint in endpoints {
            let body = fetch_text(status.api_url.as_str(), endpoint)
                .await
                .unwrap_or_else(|error| format!("error: {error:#}"));
            endpoint_payloads.insert(endpoint.to_string(), serde_json::Value::String(body));
        }

        let bundle = json!({
            "daemon_status": status,
            "paths": paths,
            "preferences": self.preferences().await,
            "logs_tail": self.read_daemon_log_tail(250).await.unwrap_or_default(),
            "snapshots": endpoint_payloads,
        });
        fs::write(
            &bundle_path,
            serde_json::to_string_pretty(&bundle).context("failed to encode diagnostics bundle")?,
        )
        .context("failed to write diagnostics bundle")?;

        Ok(DiagnosticsBundleResult {
            bundle_path: bundle_path.display().to_string(),
        })
    }

    pub async fn open_logs_dir(&self) -> Result<()> {
        let dir = self.inner.lock().await.paths.log_dir.clone();
        open_path(Path::new(dir.as_str()))
    }

    pub async fn open_data_dir(&self) -> Result<()> {
        let dir = self.inner.lock().await.paths.data_dir.clone();
        open_path(Path::new(dir.as_str()))
    }

    pub async fn check_for_updates(&self) -> Result<UpdateCheckResult> {
        let configured = env::var("ANIMUS_DESKTOP_UPDATER_ENDPOINT").is_ok();
        Ok(UpdateCheckResult {
            configured,
            available: false,
            version: None,
            body: Some(if configured {
                "Updater endpoint configured; release workflows publish updater metadata only when signing prerequisites are present.".to_string()
            } else {
                "Updater endpoint not configured for this build.".to_string()
            }),
        })
    }

    pub async fn install_update(&self) -> Result<UpdateCheckResult> {
        let mut result = self.check_for_updates().await?;
        if result.configured {
            result.body = Some(
                "Automatic update install requires signed updater metadata; this preview build only verifies wiring.".to_string(),
            );
        }
        Ok(result)
    }

    pub async fn close_to_tray_enabled(&self) -> bool {
        self.inner.lock().await.preferences.close_to_tray
    }

    async fn mark_exited(&self, app: &AppHandle, pid: u32, exit_code: Option<i32>) -> Result<()> {
        let mut inner = self.inner.lock().await;
        if inner.status.pid == Some(pid) {
            inner.status.pid = None;
            inner.status.healthy = false;
            inner.status.state = "degraded".to_string();
            inner.status.last_exit_code = exit_code;
            inner.status.last_error = Some(format!(
                "link-daemon sidecar exited with code {:?}",
                exit_code
            ));
        }
        drop(inner);
        self.emit_status(app).await?;
        Ok(())
    }

    pub async fn emit_status(&self, app: &AppHandle) -> Result<()> {
        let status = self.inner.lock().await.status.clone();
        app.emit(STATUS_EVENT, json!({ "status": status }))
            .context("failed to emit daemon status event")?;
        Ok(())
    }
}

fn resolve_app_paths(app: &AppHandle) -> Result<AppPaths> {
    let path = app.path();
    let config_dir = path
        .app_config_dir()
        .context("missing app config directory")?;
    let data_dir = path.app_data_dir().context("missing app data directory")?;
    let cache_dir = path
        .app_cache_dir()
        .context("missing app cache directory")?;
    let log_dir = path.app_log_dir().context("missing app log directory")?;

    Ok(AppPaths {
        config_dir: config_dir.display().to_string(),
        data_dir: data_dir.display().to_string(),
        cache_dir: cache_dir.display().to_string(),
        log_dir: log_dir.display().to_string(),
        desktop_state_file: config_dir.join("desktop-state.json").display().to_string(),
        daemon_state_file: data_dir.join("daemon-state.json").display().to_string(),
        daemon_log_file: log_dir.join("link-daemon.log").display().to_string(),
    })
}

fn load_preferences(path: &Path) -> Result<DesktopPreferences> {
    if !path.exists() {
        let preferences = DesktopPreferences::default();
        persist_preferences(path, preferences.clone())?;
        return Ok(preferences);
    }
    let text = fs::read_to_string(path).context("failed to read desktop state file")?;
    let mut preferences: DesktopPreferences =
        serde_json::from_str(text.as_str()).context("failed to decode desktop state")?;
    if preferences.device_label.trim().is_empty() {
        preferences.device_label = hostname_guess();
    }
    Ok(preferences)
}

fn persist_preferences(path: &Path, preferences: DesktopPreferences) -> Result<()> {
    ensure_parent_dir(path)?;
    fs::write(
        path,
        serde_json::to_string_pretty(&preferences).context("failed to encode desktop state")?,
    )
    .context("failed to write desktop state")?;
    Ok(())
}

fn ensure_parent_dir(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).context("failed to create parent directory")?;
    }
    Ok(())
}

fn open_log_file(path: &Path) -> Result<File> {
    ensure_parent_dir(path)?;
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .context("failed to open daemon log file")
}

fn reserve_loopback_port() -> Result<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).context("failed to bind loopback port")?;
    Ok(listener
        .local_addr()
        .context("failed to read loopback port")?
        .port())
}

fn resolve_daemon_binary(
    app: &AppHandle,
    preferences: &DesktopPreferences,
) -> Result<(PathBuf, SidecarMode)> {
    if let Some(path) = preferences
        .dev_daemon_binary_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
    {
        return Ok((PathBuf::from(path), SidecarMode::DevOverride));
    }

    let workspace_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")));
    let workspace_candidates = [
        workspace_dir
            .join("target/debug")
            .join(binary_name("link-daemon")),
        workspace_dir
            .join("target/release")
            .join(binary_name("link-daemon")),
    ];
    if let Some(candidate) = workspace_candidates.iter().find(|path| path.exists()) {
        return Ok((candidate.clone(), SidecarMode::DetectedWorkspace));
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .context("resource dir not available for bundled sidecar")?;
    let target = current_target_triple();
    let bundled = resource_dir
        .join("bin")
        .join(binary_name(format!("link-daemon-{target}").as_str()));
    if bundled.exists() {
        return Ok((bundled, SidecarMode::Bundled));
    }

    Err(anyhow!("unable to locate link-daemon sidecar binary"))
}

async fn health_check(api_url: &str) -> bool {
    fetch_text(api_url, HEALTH_PATH).await.is_ok()
}

async fn wait_for_health(api_url: &str) -> bool {
    let started_at = now_unix_secs();
    loop {
        if health_check(api_url).await {
            return true;
        }
        if now_unix_secs().saturating_sub(started_at) * 1000 >= DAEMON_START_TIMEOUT_MS as u64 {
            return false;
        }
        sleep(Duration::from_millis(200)).await;
    }
}

async fn fetch_text(api_url: &str, path: &str) -> Result<String> {
    let authority = api_url
        .trim()
        .strip_prefix("http://")
        .ok_or_else(|| anyhow!("daemon API URL must start with http://"))?;
    let mut stream = TcpStream::connect(authority)
        .await
        .context("failed to connect to daemon API")?;
    let request = format!("GET {path} HTTP/1.1\r\nHost: {authority}\r\nConnection: close\r\n\r\n");
    tokio::io::AsyncWriteExt::write_all(&mut stream, request.as_bytes())
        .await
        .context("failed to write daemon request")?;
    let mut response = Vec::new();
    tokio::io::AsyncReadExt::read_to_end(&mut stream, &mut response)
        .await
        .context("failed to read daemon response")?;
    let response = String::from_utf8(response).context("daemon response was not utf8")?;
    let (_, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| anyhow!("invalid daemon response"))?;
    Ok(body.to_string())
}

async fn terminate_process(pid: u32) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("taskkill")
            .arg("/PID")
            .arg(pid.to_string())
            .arg("/T")
            .arg("/F")
            .status()
            .await
            .context("failed to execute taskkill")?;
        if !status.success() {
            return Err(anyhow!("taskkill returned a non-zero exit status"));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .status()
            .await
            .context("failed to execute kill")?;
        if !status.success() {
            return Err(anyhow!("kill returned a non-zero exit status"));
        }
    }

    Ok(())
}

fn binary_name(name: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        format!("{name}.exe")
    }

    #[cfg(not(target_os = "windows"))]
    {
        name.to_string()
    }
}

fn current_target_triple() -> &'static str {
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "x86_64-unknown-linux-gnu"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "aarch64-apple-darwin"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "x86_64-apple-darwin"
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "x86_64-pc-windows-msvc"
    }
}

fn open_path(path: &Path) -> Result<()> {
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer");
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut command = std::process::Command::new("xdg-open");

    let status = command
        .arg(path)
        .status()
        .context("failed to open path in system file manager")?;
    if !status.success() {
        return Err(anyhow!("file manager command returned non-zero status"));
    }
    Ok(())
}

fn read_tail(path: &Path, lines: usize) -> Result<String> {
    let mut file = File::open(path).context("failed to open log file")?;
    let mut text = String::new();
    file.read_to_string(&mut text)
        .context("failed to read log file")?;
    let collected = text
        .lines()
        .rev()
        .take(lines)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n");
    Ok(collected)
}

fn hostname_guess() -> String {
    env::var("COMPUTERNAME")
        .or_else(|_| env::var("HOSTNAME"))
        .unwrap_or_else(|_| "This Device".to_string())
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::{binary_name, DesktopPreferences};

    #[test]
    fn default_preferences_are_safe() {
        let defaults = DesktopPreferences::default();
        assert!(defaults.close_to_tray);
        assert_eq!(defaults.updater_channel, "stable");
        assert!(defaults.dev_daemon_binary_path.is_none());
    }

    #[test]
    fn binary_name_matches_platform() {
        let name = binary_name("link-daemon");
        #[cfg(target_os = "windows")]
        assert!(name.ends_with(".exe"));
        #[cfg(not(target_os = "windows"))]
        assert_eq!(name, "link-daemon");
    }
}
