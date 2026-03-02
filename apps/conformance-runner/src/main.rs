use anyhow::{anyhow, bail, Context};
use bytes::BytesMut;
use clap::Parser;
use fabric_crypto::{DeterministicPrimitives, NoiseRole, NoiseXXHandshake};
use fabric_discovery::{
    canonicalize_record, derive_public_key as derive_discovery_public_key, sign_record,
    verify_record_signature, DiscoveryRecord,
};
use fabric_relay_proto::messages::{RelayCtrlEnvelope, RELAY_CTRL_SCHEMA_VERSION};
use fabric_session::replay::AntiReplay;
use fabric_wire::{
    codec::{decode_header, encode_header},
    errors::WireError,
    FrameHeader, MessageType,
};
use serde::{de::DeserializeOwned, Deserialize};
use std::{
    fmt::Write as _,
    fs,
    path::{Path, PathBuf},
};

#[derive(Parser)]
#[command(
    name = "conformance-runner",
    about = "Runs conformance vectors and validates protocol behavior"
)]
struct Args {
    #[arg(long, default_value = "all")]
    run: String,
    #[arg(long)]
    list: bool,
}

#[derive(Debug, Deserialize)]
struct GenericVectorFile {
    name: String,
    vectors: Vec<serde_json::Value>,
}

#[derive(Debug, Default)]
struct Totals {
    passed: usize,
    failed: usize,
    skipped: usize,
    suites_run: usize,
}

#[derive(Debug, Deserialize)]
struct FramingVectorFile {
    name: String,
    vectors: Vec<FramingVector>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum FramingVector {
    Roundtrip {
        id: String,
        header: HeaderVector,
        encoded_hex: String,
    },
    DecodeError {
        id: String,
        encoded_hex: String,
        error: ExpectedWireError,
    },
}

#[derive(Debug, Deserialize)]
struct HeaderVector {
    conn_id: u64,
    pn: u64,
    stream_id: u32,
    msg_type: VectorMessageType,
    len: u16,
}

impl HeaderVector {
    fn to_header(&self) -> FrameHeader {
        FrameHeader::new(
            self.conn_id,
            self.pn,
            self.stream_id,
            self.msg_type.to_wire(),
            self.len,
        )
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum VectorMessageType {
    HandshakeInit,
    HandshakeResp,
    Data,
    Keepalive,
    Close,
    RelayCtrl,
    RelayData,
}

impl VectorMessageType {
    fn to_wire(&self) -> MessageType {
        match self {
            Self::HandshakeInit => MessageType::HandshakeInit,
            Self::HandshakeResp => MessageType::HandshakeResp,
            Self::Data => MessageType::Data,
            Self::Keepalive => MessageType::KeepAlive,
            Self::Close => MessageType::Close,
            Self::RelayCtrl => MessageType::RelayCtrl,
            Self::RelayData => MessageType::RelayData,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ExpectedWireError {
    Truncated,
    UnknownType,
}

impl ExpectedWireError {
    fn matches(&self, error: &WireError) -> bool {
        matches!(
            (self, error),
            (Self::Truncated, WireError::Truncated)
                | (Self::UnknownType, WireError::UnknownType(_))
        )
    }
}

#[derive(Debug, Deserialize)]
struct AntiReplayVectorFile {
    name: String,
    vectors: Vec<AntiReplayVector>,
}

#[derive(Debug, Deserialize)]
struct AntiReplayVector {
    id: String,
    sequence: Vec<u64>,
    expected: Vec<bool>,
}

#[derive(Debug, Deserialize)]
struct RelayCtrlVectorFile {
    name: String,
    vectors: Vec<RelayCtrlVector>,
}

#[derive(Debug, Deserialize)]
struct RelayCtrlVector {
    id: String,
    message: serde_json::Value,
    canonical_json: String,
}

#[derive(Debug, Deserialize)]
struct HandshakeNoiseVectorFile {
    name: String,
    vectors: Vec<HandshakeNoiseVector>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum HandshakeNoiseVector {
    Roundtrip {
        id: String,
        prologue: String,
        initiator_seed_hex: String,
        responder_seed_hex: String,
        msg1_payload: String,
        msg2_payload: String,
        msg3_payload: String,
    },
    PrologueMismatch {
        id: String,
        initiator_prologue: String,
        responder_prologue: String,
        initiator_seed_hex: String,
        responder_seed_hex: String,
        msg1_payload: String,
    },
}

#[derive(Debug, Deserialize)]
struct DiscoveryVectorFile {
    name: String,
    vectors: Vec<DiscoveryVector>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum DiscoveryVector {
    SeededVerify {
        id: String,
        signing_seed_hex: String,
        record: DiscoveryRecord,
        verify_record: Option<DiscoveryRecord>,
        canonical_json: String,
        expected_valid: bool,
    },
}

fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    let dir = PathBuf::from("conformance/vectors");
    let files = vector_files(&dir)?;

    if args.list {
        for p in files {
            let vf: GenericVectorFile = load_typed(&p)?;
            println!("{} ({} vectors)", vf.name, vf.vectors.len());
        }
        return Ok(());
    }

    let mut totals = Totals::default();
    for p in files {
        let vf: GenericVectorFile = load_typed(&p)?;
        if !should_run(&args.run, &vf.name, &p) {
            continue;
        }
        totals.suites_run += 1;

        match vf.name.as_str() {
            "framing_aead" => run_framing_suite(&p, &mut totals)?,
            "anti_replay_window" => run_anti_replay_suite(&p, &mut totals)?,
            "relay_ctrl" => run_relay_ctrl_suite(&p, &mut totals)?,
            "handshake_noise_xx" => run_handshake_noise_suite(&p, &mut totals)?,
            "discovery_records" => run_discovery_suite(&p, &mut totals)?,
            _ => {
                println!(
                    "SKIP {} ({} vectors): no executable checks implemented yet",
                    vf.name,
                    vf.vectors.len()
                );
                totals.skipped += vf.vectors.len();
            }
        }
    }

    if totals.suites_run == 0 {
        bail!("no vector suites matched --run={}", args.run);
    }

    println!(
        "summary: passed={}, failed={}, skipped={}",
        totals.passed, totals.failed, totals.skipped
    );

    if totals.failed > 0 {
        bail!("conformance checks failed");
    }
    Ok(())
}

fn vector_files(dir: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    for entry in fs::read_dir(dir).with_context(|| format!("read_dir {}", dir.display()))? {
        let path = entry?.path();
        if path.extension().and_then(|x| x.to_str()) == Some("json") {
            files.push(path);
        }
    }
    files.sort();
    Ok(files)
}

fn load_typed<T: DeserializeOwned>(path: &Path) -> anyhow::Result<T> {
    let data = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    serde_json::from_str(&data).with_context(|| format!("parse {}", path.display()))
}

fn should_run(selector: &str, suite_name: &str, path: &Path) -> bool {
    if selector == "all" {
        return true;
    }
    selector.split(',').map(str::trim).any(|selection| {
        if selection == suite_name {
            return true;
        }
        path.file_stem().and_then(|x| x.to_str()) == Some(selection)
    })
}

fn run_framing_suite(path: &Path, totals: &mut Totals) -> anyhow::Result<()> {
    let suite: FramingVectorFile = load_typed(path)?;
    let mut suite_failures = 0usize;

    for vector in &suite.vectors {
        match run_framing_vector(vector) {
            Ok(()) => {
                totals.passed += 1;
            }
            Err(err) => {
                suite_failures += 1;
                totals.failed += 1;
                println!("FAIL {}: {}", suite.name, err);
            }
        }
    }

    println!(
        "{}: passed={}, failed={}",
        suite.name,
        suite.vectors.len() - suite_failures,
        suite_failures
    );
    Ok(())
}

fn run_framing_vector(vector: &FramingVector) -> anyhow::Result<()> {
    match vector {
        FramingVector::Roundtrip {
            id,
            header,
            encoded_hex,
        } => {
            let expected_bytes =
                decode_hex(encoded_hex).with_context(|| format!("{id}: decode expected hex"))?;
            let expected_header = header.to_header();

            let decoded = decode_header(&expected_bytes)
                .map_err(|err| anyhow!("{id}: decode expected bytes failed: {err}"))?;
            if !headers_equal(&decoded, &expected_header) {
                bail!("{id}: decoded header does not match vector input");
            }

            let mut out = BytesMut::with_capacity(FrameHeader::SIZE);
            encode_header(&expected_header, &mut out);
            let actual_bytes = out.to_vec();
            if actual_bytes != expected_bytes {
                bail!(
                    "{id}: encoded bytes mismatch: expected={}, actual={}",
                    encoded_hex.to_ascii_lowercase(),
                    encode_hex(&actual_bytes)
                );
            }
            Ok(())
        }
        FramingVector::DecodeError {
            id,
            encoded_hex,
            error,
        } => {
            let bytes =
                decode_hex(encoded_hex).with_context(|| format!("{id}: decode expected hex"))?;
            match decode_header(&bytes) {
                Ok(_) => bail!("{id}: expected decode error, got success"),
                Err(actual) if error.matches(&actual) => Ok(()),
                Err(actual) => bail!("{id}: expected {:?}, got {}", error, actual),
            }
        }
    }
}

fn headers_equal(a: &FrameHeader, b: &FrameHeader) -> bool {
    a.conn_id == b.conn_id
        && a.pn == b.pn
        && a.stream_id == b.stream_id
        && a.msg_type == b.msg_type
        && a.len == b.len
}

fn run_anti_replay_suite(path: &Path, totals: &mut Totals) -> anyhow::Result<()> {
    let suite: AntiReplayVectorFile = load_typed(path)?;
    let mut suite_failures = 0usize;

    for vector in &suite.vectors {
        match run_anti_replay_vector(vector) {
            Ok(()) => {
                totals.passed += 1;
            }
            Err(err) => {
                suite_failures += 1;
                totals.failed += 1;
                println!("FAIL {}: {}", suite.name, err);
            }
        }
    }

    println!(
        "{}: passed={}, failed={}",
        suite.name,
        suite.vectors.len() - suite_failures,
        suite_failures
    );
    Ok(())
}

fn run_anti_replay_vector(vector: &AntiReplayVector) -> anyhow::Result<()> {
    if vector.sequence.len() != vector.expected.len() {
        bail!(
            "{}: sequence/expected length mismatch ({} != {})",
            vector.id,
            vector.sequence.len(),
            vector.expected.len()
        );
    }

    let mut anti_replay = AntiReplay::new();
    let mut actual = Vec::with_capacity(vector.sequence.len());
    for pn in &vector.sequence {
        actual.push(anti_replay.accept(*pn));
    }

    if actual != vector.expected {
        bail!(
            "{}: acceptance mismatch; expected={:?}, actual={:?}",
            vector.id,
            vector.expected,
            actual
        );
    }
    Ok(())
}

fn run_relay_ctrl_suite(path: &Path, totals: &mut Totals) -> anyhow::Result<()> {
    let suite: RelayCtrlVectorFile = load_typed(path)?;
    let mut suite_failures = 0usize;

    for vector in &suite.vectors {
        match run_relay_ctrl_vector(vector) {
            Ok(()) => {
                totals.passed += 1;
            }
            Err(err) => {
                suite_failures += 1;
                totals.failed += 1;
                println!("FAIL {}: {}", suite.name, err);
            }
        }
    }

    println!(
        "{}: passed={}, failed={}",
        suite.name,
        suite.vectors.len() - suite_failures,
        suite_failures
    );
    Ok(())
}

fn run_relay_ctrl_vector(vector: &RelayCtrlVector) -> anyhow::Result<()> {
    let message: RelayCtrlEnvelope = serde_json::from_value(vector.message.clone())
        .with_context(|| format!("{}: parse message payload", vector.id))?;
    if message.version != RELAY_CTRL_SCHEMA_VERSION {
        bail!(
            "{}: unexpected relay ctrl version {} (expected {})",
            vector.id,
            message.version,
            RELAY_CTRL_SCHEMA_VERSION
        );
    }

    let encoded = serde_json::to_string(&message)
        .with_context(|| format!("{}: encode message payload", vector.id))?;
    if encoded != vector.canonical_json {
        bail!(
            "{}: encoding mismatch; expected={}, actual={}",
            vector.id,
            vector.canonical_json,
            encoded
        );
    }

    let decoded: RelayCtrlEnvelope = serde_json::from_str(&vector.canonical_json)
        .with_context(|| format!("{}: decode canonical_json", vector.id))?;
    let roundtrip = serde_json::to_string(&decoded)
        .with_context(|| format!("{}: re-encode decoded canonical_json", vector.id))?;
    if roundtrip != vector.canonical_json {
        bail!(
            "{}: roundtrip stability mismatch; expected={}, actual={}",
            vector.id,
            vector.canonical_json,
            roundtrip
        );
    }

    Ok(())
}

fn run_handshake_noise_suite(path: &Path, totals: &mut Totals) -> anyhow::Result<()> {
    let suite: HandshakeNoiseVectorFile = load_typed(path)?;
    let mut suite_failures = 0usize;

    for vector in &suite.vectors {
        match run_handshake_noise_vector(vector) {
            Ok(()) => {
                totals.passed += 1;
            }
            Err(err) => {
                suite_failures += 1;
                totals.failed += 1;
                println!("FAIL {}: {}", suite.name, err);
            }
        }
    }

    println!(
        "{}: passed={}, failed={}",
        suite.name,
        suite.vectors.len() - suite_failures,
        suite_failures
    );
    Ok(())
}

fn run_handshake_noise_vector(vector: &HandshakeNoiseVector) -> anyhow::Result<()> {
    match vector {
        HandshakeNoiseVector::Roundtrip {
            id,
            prologue,
            initiator_seed_hex,
            responder_seed_hex,
            msg1_payload,
            msg2_payload,
            msg3_payload,
        } => {
            let initiator_seed = decode_seed_hex(id, "initiator_seed_hex", initiator_seed_hex)?;
            let responder_seed = decode_seed_hex(id, "responder_seed_hex", responder_seed_hex)?;
            let mut initiator = NoiseXXHandshake::new(
                NoiseRole::Initiator,
                prologue.as_bytes(),
                DeterministicPrimitives::new(initiator_seed),
            );
            let mut responder = NoiseXXHandshake::new(
                NoiseRole::Responder,
                prologue.as_bytes(),
                DeterministicPrimitives::new(responder_seed),
            );

            let msg1 = initiator
                .write_message(msg1_payload.as_bytes())
                .with_context(|| format!("{id}: initiator write msg1"))?;
            let decoded1 = responder
                .read_message(msg1.as_slice())
                .with_context(|| format!("{id}: responder read msg1"))?;
            if decoded1 != msg1_payload.as_bytes() {
                bail!("{id}: msg1 payload mismatch");
            }

            let msg2 = responder
                .write_message(msg2_payload.as_bytes())
                .with_context(|| format!("{id}: responder write msg2"))?;
            let decoded2 = initiator
                .read_message(msg2.as_slice())
                .with_context(|| format!("{id}: initiator read msg2"))?;
            if decoded2 != msg2_payload.as_bytes() {
                bail!("{id}: msg2 payload mismatch");
            }

            let msg3 = initiator
                .write_message(msg3_payload.as_bytes())
                .with_context(|| format!("{id}: initiator write msg3"))?;
            let decoded3 = responder
                .read_message(msg3.as_slice())
                .with_context(|| format!("{id}: responder read msg3"))?;
            if decoded3 != msg3_payload.as_bytes() {
                bail!("{id}: msg3 payload mismatch");
            }

            if !initiator.is_complete() || !responder.is_complete() {
                bail!("{id}: handshake did not complete");
            }

            let initiator_keys = initiator
                .transport_keys()
                .ok_or_else(|| anyhow!("{id}: initiator transport keys missing"))?;
            let responder_keys = responder
                .transport_keys()
                .ok_or_else(|| anyhow!("{id}: responder transport keys missing"))?;
            if initiator_keys.send_key_bytes() != responder_keys.recv_key_bytes()
                || initiator_keys.recv_key_bytes() != responder_keys.send_key_bytes()
            {
                bail!("{id}: transport keys do not match across roles");
            }
            Ok(())
        }
        HandshakeNoiseVector::PrologueMismatch {
            id,
            initiator_prologue,
            responder_prologue,
            initiator_seed_hex,
            responder_seed_hex,
            msg1_payload,
        } => {
            let initiator_seed = decode_seed_hex(id, "initiator_seed_hex", initiator_seed_hex)?;
            let responder_seed = decode_seed_hex(id, "responder_seed_hex", responder_seed_hex)?;
            let mut initiator = NoiseXXHandshake::new(
                NoiseRole::Initiator,
                initiator_prologue.as_bytes(),
                DeterministicPrimitives::new(initiator_seed),
            );
            let mut responder = NoiseXXHandshake::new(
                NoiseRole::Responder,
                responder_prologue.as_bytes(),
                DeterministicPrimitives::new(responder_seed),
            );

            let msg1 = initiator
                .write_message(msg1_payload.as_bytes())
                .with_context(|| format!("{id}: initiator write msg1"))?;
            if responder.read_message(msg1.as_slice()).is_ok() {
                bail!("{id}: expected prologue mismatch failure, got success");
            }
            Ok(())
        }
    }
}

fn run_discovery_suite(path: &Path, totals: &mut Totals) -> anyhow::Result<()> {
    let suite: DiscoveryVectorFile = load_typed(path)?;
    let mut suite_failures = 0usize;

    for vector in &suite.vectors {
        match run_discovery_vector(vector) {
            Ok(()) => {
                totals.passed += 1;
            }
            Err(err) => {
                suite_failures += 1;
                totals.failed += 1;
                println!("FAIL {}: {}", suite.name, err);
            }
        }
    }

    println!(
        "{}: passed={}, failed={}",
        suite.name,
        suite.vectors.len() - suite_failures,
        suite_failures
    );
    Ok(())
}

fn run_discovery_vector(vector: &DiscoveryVector) -> anyhow::Result<()> {
    match vector {
        DiscoveryVector::SeededVerify {
            id,
            signing_seed_hex,
            record,
            verify_record,
            canonical_json,
            expected_valid,
        } => {
            let seed = decode_seed_hex(id, "signing_seed_hex", signing_seed_hex)?;
            let canonical = canonicalize_record(record)
                .with_context(|| format!("{id}: canonicalize discovery record"))?;
            if &canonical != canonical_json {
                bail!(
                    "{id}: canonical_json mismatch; expected={}, actual={}",
                    canonical_json,
                    canonical
                );
            }

            let signature = sign_record(record, seed)
                .with_context(|| format!("{id}: sign discovery record"))?;
            let verify_target = verify_record.as_ref().unwrap_or(record);
            let verify_result = verify_record_signature(
                verify_target,
                signature,
                derive_discovery_public_key(seed),
            )
            .with_context(|| format!("{id}: verify discovery signature"));

            if *expected_valid {
                verify_result?;
            } else if verify_result.is_ok() {
                bail!("{id}: expected invalid signature verification, got success");
            }

            Ok(())
        }
    }
}

fn decode_seed_hex(id: &str, field: &str, value: &str) -> anyhow::Result<[u8; 32]> {
    let raw = decode_hex(value).with_context(|| format!("{id}: decode {field}"))?;
    if raw.len() != 32 {
        bail!("{id}: {field} must decode to exactly 32 bytes");
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&raw);
    Ok(out)
}

fn decode_hex(input: &str) -> anyhow::Result<Vec<u8>> {
    let filtered: Vec<char> = input.chars().filter(|c| !c.is_ascii_whitespace()).collect();
    if filtered.len() % 2 != 0 {
        bail!("hex string has odd length");
    }

    let mut out = Vec::with_capacity(filtered.len() / 2);
    for i in (0..filtered.len()).step_by(2) {
        let hi = filtered[i]
            .to_digit(16)
            .ok_or_else(|| anyhow!("invalid hex char '{}'", filtered[i]))?;
        let lo = filtered[i + 1]
            .to_digit(16)
            .ok_or_else(|| anyhow!("invalid hex char '{}'", filtered[i + 1]))?;
        out.push(((hi << 4) | lo) as u8);
    }
    Ok(out)
}

fn encode_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(&mut out, "{byte:02x}");
    }
    out
}
