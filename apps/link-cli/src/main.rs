mod client;
mod cmd_info;
mod cmd_invite;
mod cmd_service;
mod cmd_tunnel;
mod errors;
mod output;

use std::process::ExitCode;

use clap::{Parser, Subcommand};

use crate::{
    client::DaemonClient,
    cmd_invite::InviteCommand,
    cmd_service::ServiceCommand,
    cmd_tunnel::TunnelCommand,
    errors::CliError,
    output::{print_output, OutputFormat},
};

#[derive(Debug, Parser)]
#[command(name = "link-cli", about = "Link CLI (MVP)")]
struct Cli {
    #[arg(
        long,
        global = true,
        env = "LINK_DAEMON_URL",
        default_value = "http://127.0.0.1:9999"
    )]
    daemon: String,
    #[arg(long, global = true, default_value_t = false)]
    json: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Health,
    Status,
    #[command(name = "self-check")]
    SelfCheck,
    Diagnostics,
    Metrics,
    Invite {
        #[command(subcommand)]
        command: InviteCommand,
    },
    Service {
        #[command(subcommand)]
        command: ServiceCommand,
    },
    Tunnel {
        #[command(subcommand)]
        command: TunnelCommand,
    },
}

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<(), CliError> {
    let cli = Cli::parse();
    let client = DaemonClient::new(cli.daemon.as_str())?;
    let format = if cli.json {
        OutputFormat::Json
    } else {
        OutputFormat::Human
    };

    let output = match &cli.command {
        Command::Health => cmd_info::health(&client).await?,
        Command::Status => cmd_info::status(&client).await?,
        Command::SelfCheck => cmd_info::self_check(&client).await?,
        Command::Diagnostics => cmd_info::diagnostics(&client).await?,
        Command::Metrics => cmd_info::metrics(&client).await?,
        Command::Invite { command } => cmd_invite::run(&client, command).await?,
        Command::Service { command } => cmd_service::run(&client, command).await?,
        Command::Tunnel { command } => cmd_tunnel::run(&client, command).await?,
    };

    print_output(&output, format)
}
