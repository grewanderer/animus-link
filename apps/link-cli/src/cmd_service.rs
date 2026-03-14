use clap::{Args, Subcommand};
use serde::Serialize;
use serde_json::json;

use crate::{
    client::DaemonClient,
    errors::CliError,
    output::{number_at, optional_string_at, string_at, CommandOutput},
};

#[derive(Debug, Subcommand)]
pub enum ServiceCommand {
    Expose(ServiceExposeArgs),
    Connect(ServiceConnectArgs),
    List,
}

#[derive(Debug, Args)]
pub struct ServiceExposeArgs {
    pub service_name: String,
    pub local_addr: String,
    #[arg(long = "allowed-peer", required = true)]
    pub allowed_peers: Vec<String>,
}

#[derive(Debug, Args)]
pub struct ServiceConnectArgs {
    pub service_name: String,
}

#[derive(Debug, Serialize)]
struct ExposeRequest<'a> {
    service_name: &'a str,
    local_addr: &'a str,
    allowed_peers: Vec<String>,
}

#[derive(Debug, Serialize)]
struct ConnectRequest<'a> {
    service_name: &'a str,
}

pub async fn run(
    client: &DaemonClient,
    command: &ServiceCommand,
) -> Result<CommandOutput, CliError> {
    match command {
        ServiceCommand::Expose(args) => expose(client, args).await,
        ServiceCommand::Connect(args) => connect(client, args).await,
        ServiceCommand::List => list(client).await,
    }
}

async fn expose(
    client: &DaemonClient,
    args: &ServiceExposeArgs,
) -> Result<CommandOutput, CliError> {
    if args.allowed_peers.is_empty() {
        return Err(CliError::config(
            "service expose requires at least one --allowed-peer",
        ));
    }

    let json = client
        .post_json(
            "/v1/expose",
            &ExposeRequest {
                service_name: args.service_name.as_str(),
                local_addr: args.local_addr.as_str(),
                allowed_peers: args.allowed_peers.clone(),
            },
        )
        .await?;
    let human = format!(
        "service_name: {}\nstream_id: {}",
        args.service_name,
        number_at(&json, &["stream_id"])
    );
    Ok(CommandOutput::new(json, human))
}

async fn connect(
    client: &DaemonClient,
    args: &ServiceConnectArgs,
) -> Result<CommandOutput, CliError> {
    let json = client
        .post_json(
            "/v1/connect",
            &ConnectRequest {
                service_name: args.service_name.as_str(),
            },
        )
        .await?;
    let human = format!(
        "service_name: {}\nconnection_id: {}\nstream_id: {}\nlocal_addr: {}",
        args.service_name,
        number_at(&json, &["connection_id"]),
        number_at(&json, &["stream_id"]),
        optional_string_at(&json, &["local_addr"])
    );
    Ok(CommandOutput::new(json, human))
}

async fn list(client: &DaemonClient) -> Result<CommandOutput, CliError> {
    let status = client.get_json("/v1/status").await?;
    let diagnostics = client.get_json("/v1/diagnostics").await?;
    let json = json!({
        "api_version": "v1",
        "service_listing_supported": false,
        "services": [],
        "status": status,
        "diagnostics": diagnostics,
    });

    let human = format!(
        "service_listing_supported: false\nrunning: {}\npath: {}\nnamespace_count: {}\nsource: status+diagnostics fallback",
        crate::output::bool_at(&json["status"], &["running"]),
        string_at(&json["status"], &["path"]),
        number_at(&json["diagnostics"], &["config_summary", "namespace_count"]),
    );
    Ok(CommandOutput::new(json, human))
}
