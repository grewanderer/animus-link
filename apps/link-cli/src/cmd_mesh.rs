use clap::{Args, Subcommand};
use serde::Serialize;

use crate::{
    client::DaemonClient,
    errors::CliError,
    output::{array_len_at, number_at, optional_string_at, string_at, CommandOutput},
};

#[derive(Debug, Subcommand)]
pub enum MeshCommand {
    Create(MeshCreateArgs),
    List,
    Invite(MeshInviteArgs),
    Join(MeshJoinArgs),
    Peers(MeshPeersArgs),
    Revoke(MeshRevokeArgs),
}

#[derive(Debug, Args)]
pub struct MeshCreateArgs {
    #[arg(long)]
    pub name: Option<String>,
}

#[derive(Debug, Args)]
pub struct MeshInviteArgs {
    pub mesh_id: String,
}

#[derive(Debug, Args)]
pub struct MeshJoinArgs {
    pub invite: String,
    #[arg(long)]
    pub bootstrap_url: String,
}

#[derive(Debug, Args)]
pub struct MeshPeersArgs {
    pub mesh_id: String,
}

#[derive(Debug, Args)]
pub struct MeshRevokeArgs {
    pub mesh_id: String,
    pub peer_id: String,
}

#[derive(Debug, Serialize)]
struct MeshCreateRequest<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    mesh_name: Option<&'a str>,
}

#[derive(Debug, Serialize)]
struct MeshJoinRequest<'a> {
    invite: &'a str,
    bootstrap_url: &'a str,
}

pub async fn run(client: &DaemonClient, command: &MeshCommand) -> Result<CommandOutput, CliError> {
    match command {
        MeshCommand::Create(args) => create(client, args).await,
        MeshCommand::List => list(client).await,
        MeshCommand::Invite(args) => invite(client, args).await,
        MeshCommand::Join(args) => join(client, args).await,
        MeshCommand::Peers(args) => peers(client, args).await,
        MeshCommand::Revoke(args) => revoke(client, args).await,
    }
}

async fn create(client: &DaemonClient, args: &MeshCreateArgs) -> Result<CommandOutput, CliError> {
    let json = client
        .post_json(
            "/v1/meshes",
            &MeshCreateRequest {
                mesh_name: args.name.as_deref(),
            },
        )
        .await?;
    let human = format!(
        "mesh_id: {}\nmesh_name: {}\nlocal_node_id: {}",
        string_at(&json, &["mesh", "mesh_id"]),
        string_at(&json, &["mesh", "mesh_name"]),
        string_at(&json, &["mesh", "local_node_id"]),
    );
    Ok(CommandOutput::new(json, human))
}

async fn list(client: &DaemonClient) -> Result<CommandOutput, CliError> {
    let json = client.get_json("/v1/meshes").await?;
    let human = format!(
        "mesh_count: {}\nfirst_mesh_id: {}\nfirst_mesh_name: {}",
        array_len_at(&json, &["meshes"]),
        optional_string_at(&json, &["meshes", "0", "config", "mesh_id"]),
        optional_string_at(&json, &["meshes", "0", "config", "mesh_name"]),
    );
    Ok(CommandOutput::new(json, human))
}

async fn invite(client: &DaemonClient, args: &MeshInviteArgs) -> Result<CommandOutput, CliError> {
    let json = client
        .post_empty_json(format!("/v1/meshes/{}/invite", args.mesh_id).as_str())
        .await?;
    let human = format!(
        "mesh_id: {}\ninvite: {}",
        args.mesh_id,
        string_at(&json, &["invite"])
    );
    Ok(CommandOutput::new(json, human))
}

async fn join(client: &DaemonClient, args: &MeshJoinArgs) -> Result<CommandOutput, CliError> {
    let json = client
        .post_json(
            "/v1/meshes/join",
            &MeshJoinRequest {
                invite: args.invite.as_str(),
                bootstrap_url: args.bootstrap_url.as_str(),
            },
        )
        .await?;
    let human = format!(
        "mesh_id: {}\npeer_id: {}\nnode_id: {}\ninviter: {}",
        string_at(&json, &["mesh", "mesh_id"]),
        string_at(&json, &["membership", "peer_id"]),
        string_at(&json, &["membership", "node_id"]),
        optional_string_at(&json, &["inviter", "peer_id"]),
    );
    Ok(CommandOutput::new(json, human))
}

async fn peers(client: &DaemonClient, args: &MeshPeersArgs) -> Result<CommandOutput, CliError> {
    let json = client
        .get_json(format!("/v1/meshes/{}/peers", args.mesh_id).as_str())
        .await?;
    let human = format!(
        "mesh_id: {}\npeer_count: {}\nfirst_peer: {}",
        string_at(&json, &["mesh_id"]),
        array_len_at(&json, &["peers"]),
        optional_string_at(&json, &["peers", "0", "peer_id"]),
    );
    Ok(CommandOutput::new(json, human))
}

async fn revoke(client: &DaemonClient, args: &MeshRevokeArgs) -> Result<CommandOutput, CliError> {
    let json = client
        .post_empty_json(
            format!("/v1/meshes/{}/peers/{}/revoke", args.mesh_id, args.peer_id).as_str(),
        )
        .await?;
    let human = format!(
        "revoked: {}\npeer_id: {}\nrevoked_at: {}",
        json.get("revoked")
            .and_then(serde_json::Value::as_bool)
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".to_string()),
        string_at(&json, &["membership", "peer_id"]),
        number_at(&json, &["membership", "revoked_at_unix_secs"]),
    );
    Ok(CommandOutput::new(json, human))
}
