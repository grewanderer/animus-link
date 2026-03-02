use std::{env, process::ExitCode};

use camino::Utf8PathBuf;
use uniffi_bindgen::{
    bindings::{KotlinBindingGenerator, SwiftBindingGenerator},
    generate_bindings,
};

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("failed to generate bindings: {err}");
            ExitCode::from(1)
        }
    }
}

fn run() -> anyhow::Result<()> {
    let mut args = env::args();
    let _bin = args.next();
    let language = args.next().ok_or_else(|| anyhow::anyhow!(usage()))?;
    let out_dir = args.next().ok_or_else(|| anyhow::anyhow!(usage()))?;
    if args.next().is_some() {
        return Err(anyhow::anyhow!(usage()));
    }

    let manifest_dir = Utf8PathBuf::from(env::var("CARGO_MANIFEST_DIR")?);
    let udl_file = manifest_dir.join("src/fabric.udl");
    let out_dir = Utf8PathBuf::from(out_dir);

    match language.as_str() {
        "kotlin" => generate_bindings(
            &udl_file,
            None,
            KotlinBindingGenerator,
            Some(&out_dir),
            None,
            Some("fabric_ffi"),
            false,
        )?,
        "swift" => generate_bindings(
            &udl_file,
            None,
            SwiftBindingGenerator,
            Some(&out_dir),
            None,
            Some("fabric_ffi"),
            false,
        )?,
        _ => return Err(anyhow::anyhow!(usage())),
    }

    Ok(())
}

fn usage() -> &'static str {
    "usage: cargo run -p fabric-ffi --bin generate-bindings -- <kotlin|swift> <out_dir>"
}
