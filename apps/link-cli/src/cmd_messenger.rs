use clap::{Args, Subcommand};
use serde::Serialize;

use crate::{
    client::DaemonClient,
    errors::CliError,
    output::{array_len_at, bool_at, number_at, string_at, CommandOutput},
};

#[derive(Debug, Subcommand)]
pub enum MessengerCommand {
    Create(MessengerCreateArgs),
    Send(MessengerSendArgs),
    Conversations,
    Stream,
    Presence,
}

#[derive(Debug, Args)]
pub struct MessengerCreateArgs {
    #[arg(long)]
    pub mesh_id: String,
    #[arg(long = "participant", required = true)]
    pub participants: Vec<String>,
    #[arg(long)]
    pub title: Option<String>,
}

#[derive(Debug, Args)]
pub struct MessengerSendArgs {
    pub conversation_id: String,
    pub body: String,
}

#[derive(Debug, Serialize)]
struct MessengerCreateRequest<'a> {
    mesh_id: &'a str,
    participants: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<&'a str>,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Debug, Serialize)]
struct MessengerSendRequest<'a> {
    conversation_id: &'a str,
    body: &'a str,
}

pub async fn run(
    client: &DaemonClient,
    command: &MessengerCommand,
) -> Result<CommandOutput, CliError> {
    match command {
        MessengerCommand::Create(args) => create(client, args).await,
        MessengerCommand::Send(args) => send(client, args).await,
        MessengerCommand::Conversations => conversations(client).await,
        MessengerCommand::Stream => stream(client).await,
        MessengerCommand::Presence => presence(client).await,
    }
}

async fn create(
    client: &DaemonClient,
    args: &MessengerCreateArgs,
) -> Result<CommandOutput, CliError> {
    let json = client
        .post_json(
            "/v1/messenger/conversations",
            &MessengerCreateRequest {
                mesh_id: args.mesh_id.as_str(),
                participants: args.participants.clone(),
                title: args.title.as_deref(),
                tags: Vec::new(),
            },
        )
        .await?;
    let human = format!(
        "conversation_id: {}\nmesh_id: {}\nparticipant_count: {}",
        string_at(&json, &["conversation_id"]),
        string_at(&json, &["mesh_id"]),
        array_len_at(&json, &["participants"]),
    );
    Ok(CommandOutput::new(json, human))
}

async fn send(client: &DaemonClient, args: &MessengerSendArgs) -> Result<CommandOutput, CliError> {
    let json = client
        .post_json(
            "/v1/messenger/send",
            &MessengerSendRequest {
                conversation_id: args.conversation_id.as_str(),
                body: args.body.as_str(),
            },
        )
        .await?;
    let human = format!(
        "message_id: {}\nconversation_id: {}\nbody: {}",
        string_at(&json, &["message_id"]),
        string_at(&json, &["conversation_id"]),
        string_at(&json, &["body"]),
    );
    Ok(CommandOutput::new(json, human))
}

async fn conversations(client: &DaemonClient) -> Result<CommandOutput, CliError> {
    let json = client.get_json("/v1/messenger/conversations").await?;
    let human = format!(
        "conversation_count: {}",
        array_len_at(&json, &["conversations"])
    );
    Ok(CommandOutput::new(json, human))
}

async fn stream(client: &DaemonClient) -> Result<CommandOutput, CliError> {
    let json = client.get_json("/v1/messenger/stream").await?;
    let human = format!(
        "conversation_count: {}\nmessage_count: {}",
        array_len_at(&json, &["conversations"]),
        array_len_at(&json, &["messages"]),
    );
    Ok(CommandOutput::new(json, human))
}

async fn presence(client: &DaemonClient) -> Result<CommandOutput, CliError> {
    let json = client.get_json("/v1/messenger/presence").await?;
    let human = format!(
        "mesh_id: {}\npeer_count: {}\nfirst_peer_online: {}\nfirst_peer_last_seen: {}",
        string_at(&json, &["mesh_id"]),
        array_len_at(&json, &["peers"]),
        bool_at(&json, &["peers", "0", "online"]),
        number_at(&json, &["peers", "0", "last_seen_unix_secs"]),
    );
    Ok(CommandOutput::new(json, human))
}
