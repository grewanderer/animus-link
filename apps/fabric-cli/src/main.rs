use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "fabric-cli", about = "Dev CLI for Animus Fabric (MVP)")]
struct Cli {
    #[command(subcommand)]
    cmd: Command,
}

#[derive(Subcommand)]
enum Command {
    Version,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    match cli.cmd {
        Command::Version => println!("fabric-cli 0.1.0"),
    }
}
