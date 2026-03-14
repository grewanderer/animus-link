use crate::{
    client::DaemonClient,
    errors::CliError,
    output::{
        array_len_at, bool_at, json_metrics, number_at, optional_string_at, string_array_at,
        string_at, CommandOutput,
    },
};

pub async fn health(client: &DaemonClient) -> Result<CommandOutput, CliError> {
    let json = client.get_json("/v1/health").await?;
    let human = format!(
        "ok: {}\nrelay_configured: {}",
        bool_at(&json, &["ok"]),
        bool_at(&json, &["relay_configured"])
    );
    Ok(CommandOutput::new(json, human))
}

pub async fn status(client: &DaemonClient) -> Result<CommandOutput, CliError> {
    let json = client.get_json("/v1/status").await?;
    let human = format!(
        "running: {}\npeer_count: {}\npath: {}",
        bool_at(&json, &["running"]),
        number_at(&json, &["peer_count"]),
        string_at(&json, &["path"])
    );
    Ok(CommandOutput::new(json, human))
}

pub async fn self_check(client: &DaemonClient) -> Result<CommandOutput, CliError> {
    let json = client.get_json("/v1/self_check").await?;
    let mut lines = vec![
        format!("ok: {}", bool_at(&json, &["ok"])),
        format!("dns_mode: {}", string_at(&json, &["dns_mode"])),
        format!("check_count: {}", array_len_at(&json, &["checks"])),
    ];

    if let Some(checks) = json.get("checks").and_then(serde_json::Value::as_array) {
        for check in checks {
            let name = check
                .get("name")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("unknown");
            let ok = check
                .get("ok")
                .and_then(serde_json::Value::as_bool)
                .map(|value| value.to_string())
                .unwrap_or_else(|| "unknown".to_string());
            let code = check
                .get("code")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("unknown");
            lines.push(format!("check.{name}: {ok} ({code})"));
        }
    }

    Ok(CommandOutput::new(json, lines.join("\n")))
}

pub async fn diagnostics(client: &DaemonClient) -> Result<CommandOutput, CliError> {
    let json = client.get_json("/v1/diagnostics").await?;
    let notes = string_array_at(&json, &["notes"]);
    let human = format!(
        "relay_configured: {}\nrelay_name: {}\nnamespace_count: {}\nuptime_secs: {}\nrecent_errors: {}\nnotes: {}",
        bool_at(&json, &["config_summary", "relay_configured"]),
        optional_string_at(&json, &["config_summary", "relay_name"]),
        number_at(&json, &["config_summary", "namespace_count"]),
        number_at(&json, &["uptime_secs"]),
        array_len_at(&json, &["recent_errors"]),
        if notes.is_empty() {
            "none".to_string()
        } else {
            notes.join(", ")
        }
    );
    Ok(CommandOutput::new(json, human))
}

pub async fn metrics(client: &DaemonClient) -> Result<CommandOutput, CliError> {
    let metrics = client.get_text("/v1/metrics").await?;
    Ok(CommandOutput::new(
        json_metrics(metrics.as_str()),
        metrics.trim_end().to_string(),
    ))
}
