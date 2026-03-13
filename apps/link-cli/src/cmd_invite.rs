use clap::{Args, Subcommand};
use serde::Serialize;

use crate::{client::DaemonClient, errors::CliError, output::CommandOutput};

#[derive(Debug, Subcommand)]
pub enum InviteCommand {
    Create,
    Join(InviteJoinArgs),
}

#[derive(Debug, Args)]
pub struct InviteJoinArgs {
    pub invite: String,
}

#[derive(Debug, Serialize)]
struct InviteJoinRequest<'a> {
    invite: &'a str,
}

pub async fn run(
    client: &DaemonClient,
    command: &InviteCommand,
) -> Result<CommandOutput, CliError> {
    match command {
        InviteCommand::Create => create(client).await,
        InviteCommand::Join(args) => join(client, args).await,
    }
}

async fn create(client: &DaemonClient) -> Result<CommandOutput, CliError> {
    let json = client.post_empty_json("/v1/invite/create").await?;
    let invite = json
        .get("invite")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("<missing>")
        .to_string();
    Ok(CommandOutput::new(json, format!("invite: {invite}")))
}

async fn join(client: &DaemonClient, args: &InviteJoinArgs) -> Result<CommandOutput, CliError> {
    let json = client
        .post_json(
            "/v1/invite/join",
            &InviteJoinRequest {
                invite: args.invite.as_str(),
            },
        )
        .await?;
    let joined = json
        .get("joined")
        .and_then(serde_json::Value::as_bool)
        .map(|value| value.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    Ok(CommandOutput::new(json, format!("joined: {joined}")))
}
