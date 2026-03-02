use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "link-cli", about = "Link CLI (MVP)")]
struct Cli {
    #[command(subcommand)]
    cmd: Command,
}

#[derive(Subcommand)]
enum Command {
    Status,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    match cli.cmd {
        Command::Status => println!("link status: (stub)"),
    }
}
