fn main() {
    println!("cargo:rerun-if-changed=src/fabric.udl");
    uniffi::generate_scaffolding("src/fabric.udl").expect("failed to generate UniFFI scaffolding");
}
