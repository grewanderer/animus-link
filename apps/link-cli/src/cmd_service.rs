use clap::{Args, Subcommand};
use serde::Serialize;

use crate::{
    client::DaemonClient,
    errors::CliError,
    output::{array_len_at, number_at, optional_string_at, CommandOutput},
};

#[derive(Debug, Subcommand)]
pub enum ServiceCommand {
    Expose(ServiceExposeArgs),
    Connect(ServiceConnectArgs),
    List,
}

#[derive(Debug, Args)]
pub struct ServiceExposeArgs {
    #[arg(long)]
    pub mesh_id: Option<String>,
    pub service_name: String,
    pub local_addr: String,
    #[arg(long = "allowed-peer", required = true)]
    pub allowed_peers: Vec<String>,
}

#[derive(Debug, Args)]
pub struct ServiceConnectArgs {
    #[arg(long)]
    pub mesh_id: Option<String>,
    pub service_name: String,
}

#[derive(Debug, Serialize)]
struct ExposeRequest<'a> {
    service_name: &'a str,
    local_addr: &'a str,
    allowed_peers: Vec<String>,
}

#[derive(Debug, Serialize)]
struct MeshExposeRequest<'a> {
    mesh_id: &'a str,
    service_name: &'a str,
    local_addr: &'a str,
    allowed_peers: Vec<String>,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Debug, Serialize)]
struct ConnectRequest<'a> {
    service_name: &'a str,
}

#[derive(Debug, Serialize)]
struct MeshConnectRequest<'a> {
    mesh_id: &'a str,
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

    let body = match args.mesh_id.as_deref() {
        Some(mesh_id) => serde_json::to_value(MeshExposeRequest {
            mesh_id,
            service_name: args.service_name.as_str(),
            local_addr: args.local_addr.as_str(),
            allowed_peers: args.allowed_peers.clone(),
            tags: Vec::new(),
        })
        .map_err(|error| {
            CliError::invalid_response(format!("failed to encode request body: {error}"))
        })?,
        None => serde_json::to_value(ExposeRequest {
            service_name: args.service_name.as_str(),
            local_addr: args.local_addr.as_str(),
            allowed_peers: args.allowed_peers.clone(),
        })
        .map_err(|error| {
            CliError::invalid_response(format!("failed to encode request body: {error}"))
        })?,
    };
    let json = client
        .post_json(
            if args.mesh_id.is_some() {
                "/v1/services/expose"
            } else {
                "/v1/expose"
            },
            &body,
        )
        .await?;
    let human = format!(
        "service_name: {}\nstream_id: {}\nservice_id: {}",
        args.service_name,
        number_at(&json, &["stream_id"]),
        optional_string_at(&json, &["descriptor", "service_id"]),
    );
    Ok(CommandOutput::new(json, human))
}

async fn connect(
    client: &DaemonClient,
    args: &ServiceConnectArgs,
) -> Result<CommandOutput, CliError> {
    let body = match args.mesh_id.as_deref() {
        Some(mesh_id) => serde_json::to_value(MeshConnectRequest {
            mesh_id,
            service_name: args.service_name.as_str(),
        })
        .map_err(|error| {
            CliError::invalid_response(format!("failed to encode request body: {error}"))
        })?,
        None => serde_json::to_value(ConnectRequest {
            service_name: args.service_name.as_str(),
        })
        .map_err(|error| {
            CliError::invalid_response(format!("failed to encode request body: {error}"))
        })?,
    };
    let json = client
        .post_json(
            if args.mesh_id.is_some() {
                "/v1/services/connect"
            } else {
                "/v1/connect"
            },
            &body,
        )
        .await?;
    let human = format!(
        "service_name: {}\nconnection_id: {}\nstream_id: {}\nlocal_addr: {}\nroute_path: {}\nselected_relay_node_id: {}",
        args.service_name,
        number_at(&json, &["connection_id"]),
        number_at(&json, &["stream_id"]),
        optional_string_at(&json, &["local_addr"]),
        optional_string_at(&json, &["route_path"]),
        optional_string_at(&json, &["selected_relay_node_id"]),
    );
    Ok(CommandOutput::new(json, human))
}

async fn list(client: &DaemonClient) -> Result<CommandOutput, CliError> {
    let json = client.get_json("/v1/services").await?;
    let human = format!(
        "service_count: {}\nbinding_count: {}",
        array_len_at(&json, &["services"]),
        array_len_at(&json, &["bindings"]),
    );
    Ok(CommandOutput::new(json, human))
}
