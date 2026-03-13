use clap::{Args, Subcommand, ValueEnum};
use serde::Serialize;

use crate::{
    client::DaemonClient,
    errors::CliError,
    output::{bool_at, number_at, optional_string_at, string_at, CommandOutput},
};

#[derive(Debug, Subcommand)]
pub enum TunnelCommand {
    Up(TunnelUpArgs),
    Down,
    Status,
}

#[derive(Debug, Args)]
pub struct TunnelUpArgs {
    #[arg(long, default_value = "gateway-exit")]
    pub gateway_service: String,
    #[arg(long, value_enum, default_value_t = TunnelFailModeArg::OpenFast)]
    pub fail_mode: TunnelFailModeArg,
    #[arg(long, value_enum, default_value_t = TunnelDnsModeArg::RemoteBestEffort)]
    pub dns_mode: TunnelDnsModeArg,
    #[arg(long = "exclude-cidr")]
    pub exclude_cidrs: Vec<String>,
    #[arg(long, default_value_t = false)]
    pub allow_lan: bool,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
pub enum TunnelFailModeArg {
    OpenFast,
    Closed,
}

impl TunnelFailModeArg {
    fn as_api_str(self) -> &'static str {
        match self {
            Self::OpenFast => "open_fast",
            Self::Closed => "closed",
        }
    }
}

#[derive(Debug, Clone, Copy, ValueEnum)]
pub enum TunnelDnsModeArg {
    RemoteBestEffort,
    RemoteStrict,
    System,
}

impl TunnelDnsModeArg {
    fn as_api_str(self) -> &'static str {
        match self {
            Self::RemoteBestEffort => "remote_best_effort",
            Self::RemoteStrict => "remote_strict",
            Self::System => "system",
        }
    }
}

#[derive(Debug, Serialize)]
struct TunnelEnableRequest<'a> {
    gateway_service: &'a str,
    fail_mode: &'a str,
    dns_mode: &'a str,
    exclude_cidrs: Vec<String>,
    allow_lan: bool,
}

pub async fn run(
    client: &DaemonClient,
    command: &TunnelCommand,
) -> Result<CommandOutput, CliError> {
    match command {
        TunnelCommand::Up(args) => up(client, args).await,
        TunnelCommand::Down => down(client).await,
        TunnelCommand::Status => status(client).await,
    }
}

async fn up(client: &DaemonClient, args: &TunnelUpArgs) -> Result<CommandOutput, CliError> {
    let json = client
        .post_json(
            "/v1/tunnel/enable",
            &TunnelEnableRequest {
                gateway_service: args.gateway_service.as_str(),
                fail_mode: args.fail_mode.as_api_str(),
                dns_mode: args.dns_mode.as_api_str(),
                exclude_cidrs: args.exclude_cidrs.clone(),
                allow_lan: args.allow_lan,
            },
        )
        .await?;
    Ok(CommandOutput::new(json.clone(), render_status(&json)))
}

async fn down(client: &DaemonClient) -> Result<CommandOutput, CliError> {
    let json = client.post_empty_json("/v1/tunnel/disable").await?;
    Ok(CommandOutput::new(json.clone(), render_status(&json)))
}

async fn status(client: &DaemonClient) -> Result<CommandOutput, CliError> {
    let json = client.get_json("/v1/tunnel/status").await?;
    Ok(CommandOutput::new(json.clone(), render_status(&json)))
}

fn render_status(json: &serde_json::Value) -> String {
    format!(
        "enabled: {}\nstate: {}\ngateway: {}\nfail_mode: {}\ndns_mode: {}\nconnected: {}\nlast_error_code: {}\nbytes_in: {}\nbytes_out: {}\nreconnects: {}",
        bool_at(json, &["enabled"]),
        string_at(json, &["state"]),
        optional_string_at(json, &["gateway"]),
        string_at(json, &["fail_mode"]),
        string_at(json, &["dns_mode"]),
        bool_at(json, &["connected"]),
        optional_string_at(json, &["last_error_code"]),
        number_at(json, &["bytes_in"]),
        number_at(json, &["bytes_out"]),
        number_at(json, &["reconnects"]),
    )
}
