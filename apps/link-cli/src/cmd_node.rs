use clap::{Args, Subcommand};
use serde::Serialize;

use crate::{
    client::DaemonClient,
    errors::CliError,
    output::{array_len_at, string_at, CommandOutput},
};

#[derive(Debug, Subcommand)]
pub enum NodeCommand {
    SetRoles(NodeSetRolesArgs),
    ShowRoles(NodeShowRolesArgs),
}

#[derive(Debug, Args)]
pub struct NodeSetRolesArgs {
    pub node_id: String,
    #[arg(long)]
    pub mesh_id: String,
    #[arg(long = "role", required = true)]
    pub roles: Vec<String>,
}

#[derive(Debug, Args)]
pub struct NodeShowRolesArgs {
    pub node_id: String,
}

#[derive(Debug, Serialize)]
struct SetRolesRequest<'a> {
    mesh_id: &'a str,
    roles: Vec<String>,
}

pub async fn run(client: &DaemonClient, command: &NodeCommand) -> Result<CommandOutput, CliError> {
    match command {
        NodeCommand::SetRoles(args) => set_roles(client, args).await,
        NodeCommand::ShowRoles(args) => show_roles(client, args).await,
    }
}

async fn set_roles(
    client: &DaemonClient,
    args: &NodeSetRolesArgs,
) -> Result<CommandOutput, CliError> {
    let json = client
        .post_json(
            format!("/v1/nodes/{}/roles", args.node_id).as_str(),
            &SetRolesRequest {
                mesh_id: args.mesh_id.as_str(),
                roles: args.roles.clone(),
            },
        )
        .await?;
    let human = format!(
        "node_id: {}\nmesh_id: {}\nrole_count: {}",
        string_at(&json, &["node_id"]),
        string_at(&json, &["mesh_id"]),
        array_len_at(&json, &["roles"]),
    );
    Ok(CommandOutput::new(json, human))
}

async fn show_roles(
    client: &DaemonClient,
    args: &NodeShowRolesArgs,
) -> Result<CommandOutput, CliError> {
    let json = client
        .get_json(format!("/v1/nodes/{}/roles", args.node_id).as_str())
        .await?;
    let human = format!(
        "node_id: {}\nassignment_count: {}",
        string_at(&json, &["node_id"]),
        array_len_at(&json, &["assignments"]),
    );
    Ok(CommandOutput::new(json, human))
}
