use clap::{Args, Subcommand, ValueEnum};
use serde::Serialize;

use crate::{
    client::DaemonClient,
    errors::CliError,
    output::{array_len_at, optional_string_at, string_at, CommandOutput},
};

#[derive(Debug, Clone, ValueEnum)]
pub enum TargetKind {
    Peer,
    Service,
    Conversation,
    Adapter,
}

impl TargetKind {
    fn as_api_value(&self) -> &'static str {
        match self {
            Self::Peer => "peer",
            Self::Service => "service",
            Self::Conversation => "conversation",
            Self::Adapter => "adapter",
        }
    }
}

#[derive(Debug, Subcommand)]
pub enum RelayCommand {
    Advertise(RelayAdvertiseArgs),
    Select(RelaySelectArgs),
    Clear(RelayClearArgs),
    Status,
}

#[derive(Debug, Args)]
pub struct RelayAdvertiseArgs {
    pub mesh_id: String,
    #[arg(long, default_value_t = false)]
    pub forced_only: bool,
    #[arg(long = "tag")]
    pub tags: Vec<String>,
}

#[derive(Debug, Args)]
pub struct RelaySelectArgs {
    pub mesh_id: String,
    #[arg(long)]
    pub target_kind: TargetKind,
    #[arg(long)]
    pub target_id: String,
    #[arg(long)]
    pub relay_node_id: String,
    #[arg(long, default_value_t = false)]
    pub forced: bool,
}

#[derive(Debug, Args)]
pub struct RelayClearArgs {
    pub mesh_id: String,
    #[arg(long)]
    pub target_kind: TargetKind,
    #[arg(long)]
    pub target_id: String,
}

#[derive(Debug, Serialize)]
struct RelayAdvertiseRequest<'a> {
    mesh_id: &'a str,
    forced_only: bool,
    tags: Vec<String>,
}

#[derive(Debug, Serialize)]
struct RelaySelectRequest<'a> {
    mesh_id: &'a str,
    target_kind: &'a str,
    target_id: &'a str,
    relay_node_id: &'a str,
    forced: bool,
}

#[derive(Debug, Serialize)]
struct RelayClearRequest<'a> {
    mesh_id: &'a str,
    target_kind: &'a str,
    target_id: &'a str,
}

pub async fn run(client: &DaemonClient, command: &RelayCommand) -> Result<CommandOutput, CliError> {
    match command {
        RelayCommand::Advertise(args) => advertise(client, args).await,
        RelayCommand::Select(args) => select(client, args).await,
        RelayCommand::Clear(args) => clear(client, args).await,
        RelayCommand::Status => status(client).await,
    }
}

async fn advertise(
    client: &DaemonClient,
    args: &RelayAdvertiseArgs,
) -> Result<CommandOutput, CliError> {
    let json = client
        .post_json(
            "/v1/relays/advertise",
            &RelayAdvertiseRequest {
                mesh_id: args.mesh_id.as_str(),
                forced_only: args.forced_only,
                tags: args.tags.clone(),
            },
        )
        .await?;
    let human = format!(
        "relay_id: {}\nmesh_id: {}\nnode_id: {}",
        string_at(&json, &["relay_id"]),
        string_at(&json, &["mesh_id"]),
        string_at(&json, &["node_id"]),
    );
    Ok(CommandOutput::new(json, human))
}

async fn select(client: &DaemonClient, args: &RelaySelectArgs) -> Result<CommandOutput, CliError> {
    let json = client
        .post_json(
            "/v1/relays/select",
            &RelaySelectRequest {
                mesh_id: args.mesh_id.as_str(),
                target_kind: args.target_kind.as_api_value(),
                target_id: args.target_id.as_str(),
                relay_node_id: args.relay_node_id.as_str(),
                forced: args.forced,
            },
        )
        .await?;
    let human = format!(
        "mesh_id: {}\ntarget_kind: {}\ntarget_id: {}\npreferred_relay: {}\nmode: {}",
        string_at(&json, &["mesh_id"]),
        string_at(&json, &["target_kind"]),
        string_at(&json, &["target_id"]),
        optional_string_at(&json, &["preferred_relay_node_id"]),
        string_at(&json, &["mode"]),
    );
    Ok(CommandOutput::new(json, human))
}

async fn clear(client: &DaemonClient, args: &RelayClearArgs) -> Result<CommandOutput, CliError> {
    let json = client
        .post_json(
            "/v1/relays/clear-selection",
            &RelayClearRequest {
                mesh_id: args.mesh_id.as_str(),
                target_kind: args.target_kind.as_api_value(),
                target_id: args.target_id.as_str(),
            },
        )
        .await?;
    let human = format!(
        "cleared: {}",
        json.get("cleared")
            .and_then(serde_json::Value::as_bool)
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".to_string())
    );
    Ok(CommandOutput::new(json, human))
}

async fn status(client: &DaemonClient) -> Result<CommandOutput, CliError> {
    let json = client.get_json("/v1/relays/status").await?;
    let human = format!(
        "offer_count: {}\nselection_count: {}\nfirst_offer_node: {}",
        array_len_at(&json, &["offers"]),
        array_len_at(&json, &["selections"]),
        optional_string_at(&json, &["offers", "0", "node_id"]),
    );
    Ok(CommandOutput::new(json, human))
}
