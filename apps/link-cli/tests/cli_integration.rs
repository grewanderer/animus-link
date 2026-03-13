use std::{
    io,
    net::SocketAddr,
    path::PathBuf,
    process::{Command, Output},
    time::{SystemTime, UNIX_EPOCH},
};

use link_daemon::api::{run_api_server_with_listener, ApiServerConfig};
use serde_json::Value;
use tokio::{net::TcpListener, sync::oneshot};

const TEST_RELAY_SIGNING_SEED_HEX: &str =
    "1111111111111111111111111111111111111111111111111111111111111111";

struct DaemonHarness {
    addr: SocketAddr,
    shutdown_tx: Option<oneshot::Sender<()>>,
    handle: tokio::task::JoinHandle<()>,
}

impl DaemonHarness {
    async fn spawn(name: &str) -> io::Result<Option<Self>> {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == io::ErrorKind::PermissionDenied => return Ok(None),
            Err(error) => return Err(error),
        };
        let addr = listener.local_addr()?;
        let state_file = temp_state_path(name);
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let handle = tokio::spawn(async move {
            let _ = run_api_server_with_listener(
                listener,
                test_config(addr, state_file),
                Some(shutdown_rx),
            )
            .await;
        });

        Ok(Some(Self {
            addr,
            shutdown_tx: Some(shutdown_tx),
            handle,
        }))
    }

    fn daemon_url(&self) -> String {
        format!("http://{}", self.addr)
    }

    async fn shutdown(mut self) {
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }
        let _ = self.handle.await;
    }
}

fn temp_state_path(name: &str) -> PathBuf {
    let now_ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("current time")
        .as_nanos();
    std::env::temp_dir().join(format!(
        "animus-link-cli-tests/{name}-{now_ns}/namespaces.json"
    ))
}

fn test_config(api_bind: SocketAddr, state_file: PathBuf) -> ApiServerConfig {
    ApiServerConfig {
        api_bind,
        state_file: state_file.clone(),
        relay_addr: None,
        relay_name: "default-relay".to_string(),
        relay_token_signing_key_id: "relay-token-signing-v1".to_string(),
        relay_token_signing_seed_hex: Some(TEST_RELAY_SIGNING_SEED_HEX.to_string()),
        relay_token_signing_key_file: Some(state_file.with_extension("relay-token-key.hex")),
        relay_token_ttl_secs: 120,
    }
}

fn run_cli(daemon_url: &str, args: &[&str]) -> Output {
    let output = Command::new(env!("CARGO_BIN_EXE_link-cli"))
        .arg("--daemon")
        .arg(daemon_url)
        .args(args)
        .output()
        .expect("run link-cli");

    assert!(
        output.status.success(),
        "link-cli failed\nstatus: {:?}\nstdout: {}\nstderr: {}",
        output.status.code(),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );

    output
}

fn stdout_string(output: &Output) -> String {
    String::from_utf8(output.stdout.clone()).expect("stdout utf8")
}

fn stdout_json(output: &Output) -> Value {
    serde_json::from_slice(&output.stdout).expect("stdout json")
}

fn assert_no_secret(output: &str, invite: &str) {
    assert!(!output.contains(invite));
    assert!(!output.contains("animus://invite/"));
}

#[tokio::test]
async fn info_commands_emit_stable_schema_and_keep_invites_out_of_diagnostics() {
    let Some(harness) = DaemonHarness::spawn("cli-info")
        .await
        .expect("spawn daemon")
    else {
        return;
    };
    let daemon_url = harness.daemon_url();

    let invite_create = run_cli(&daemon_url, &["--json", "invite", "create"]);
    let invite = stdout_json(&invite_create)["invite"]
        .as_str()
        .expect("invite string")
        .to_string();

    let health = stdout_json(&run_cli(&daemon_url, &["--json", "health"]));
    assert_eq!(health["api_version"], "v1");
    assert_eq!(health["ok"], true);
    assert!(health["relay_configured"].is_boolean());

    let status_human = stdout_string(&run_cli(&daemon_url, &["status"]));
    assert!(status_human.contains("running: true"));
    assert!(status_human.contains("path: unknown"));

    let self_check_output = run_cli(&daemon_url, &["--json", "self-check"]);
    let self_check_stdout = stdout_string(&self_check_output);
    assert_no_secret(self_check_stdout.as_str(), invite.as_str());
    let self_check = stdout_json(&self_check_output);
    assert_eq!(self_check["api_version"], "v1");
    assert!(self_check["checks"].is_array());

    let diagnostics_output = run_cli(&daemon_url, &["--json", "diagnostics"]);
    let diagnostics_stdout = stdout_string(&diagnostics_output);
    assert_no_secret(diagnostics_stdout.as_str(), invite.as_str());
    let diagnostics = stdout_json(&diagnostics_output);
    assert_eq!(diagnostics["api_version"], "v1");
    assert!(diagnostics["config_summary"].is_object());
    assert!(diagnostics["notes"].is_array());

    let metrics_output = run_cli(&daemon_url, &["--json", "metrics"]);
    let metrics_stdout = stdout_string(&metrics_output);
    assert_no_secret(metrics_stdout.as_str(), invite.as_str());
    let metrics = stdout_json(&metrics_output);
    assert_eq!(metrics["api_version"], "v1");
    assert!(metrics["metrics"]
        .as_str()
        .expect("metrics text")
        .contains("connect_attempts_total"));

    harness.shutdown().await;
}

#[tokio::test]
async fn invite_service_and_tunnel_commands_cover_core_flows() {
    let Some(harness) = DaemonHarness::spawn("cli-core")
        .await
        .expect("spawn daemon")
    else {
        return;
    };
    let daemon_url = harness.daemon_url();

    let invite_create = run_cli(&daemon_url, &["--json", "invite", "create"]);
    let invite = stdout_json(&invite_create)["invite"]
        .as_str()
        .expect("invite string")
        .to_string();
    assert!(invite.starts_with("animus://invite/"));

    let invite_join = stdout_json(&run_cli(
        &daemon_url,
        &["--json", "invite", "join", invite.as_str()],
    ));
    assert_eq!(invite_join["api_version"], "v1");
    assert_eq!(invite_join["joined"], true);

    let expose = stdout_json(&run_cli(
        &daemon_url,
        &[
            "--json",
            "service",
            "expose",
            "echo",
            "127.0.0.1:19180",
            "--allowed-peer",
            "peer-b",
        ],
    ));
    assert_eq!(expose["api_version"], "v1");
    assert!(expose["stream_id"].is_u64());

    let connect = stdout_json(&run_cli(
        &daemon_url,
        &["--json", "service", "connect", "echo"],
    ));
    assert_eq!(connect["api_version"], "v1");
    assert!(connect["connection_id"].is_u64());
    assert!(connect["stream_id"].is_u64());

    let service_list = stdout_json(&run_cli(&daemon_url, &["--json", "service", "list"]));
    assert_eq!(service_list["api_version"], "v1");
    assert_eq!(service_list["service_listing_supported"], false);
    assert!(service_list["services"].is_array());
    assert!(service_list["status"].is_object());
    assert!(service_list["diagnostics"].is_object());

    let service_list_human = stdout_string(&run_cli(&daemon_url, &["service", "list"]));
    assert!(service_list_human.contains("service_listing_supported: false"));
    assert!(service_list_human.contains("source: status+diagnostics fallback"));

    let tunnel_status = stdout_json(&run_cli(&daemon_url, &["--json", "tunnel", "status"]));
    assert_eq!(tunnel_status["enabled"], false);
    assert_eq!(tunnel_status["state"], "disabled");

    let tunnel_up = stdout_json(&run_cli(
        &daemon_url,
        &[
            "--json",
            "tunnel",
            "up",
            "--gateway-service",
            "gateway-exit",
            "--exclude-cidr",
            "10.0.0.0/8",
            "--allow-lan",
        ],
    ));
    assert_eq!(tunnel_up["enabled"], true);
    assert_eq!(tunnel_up["state"], "degraded");
    assert_eq!(tunnel_up["last_error_code"], "relay_not_configured");

    let tunnel_down = stdout_json(&run_cli(&daemon_url, &["--json", "tunnel", "down"]));
    assert_eq!(tunnel_down["enabled"], false);
    assert_eq!(tunnel_down["state"], "disabled");

    harness.shutdown().await;
}
