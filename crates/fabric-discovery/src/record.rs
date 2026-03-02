use std::fmt::Write as _;

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

use crate::errors::DiscoveryError;

pub const DISCOVERY_RECORD_VERSION: u8 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DiscoveryEndpoint {
    pub transport: String,
    pub addr: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DiscoveryRecord {
    pub ver: u8,
    pub namespace_id: String,
    pub node_id: String,
    pub endpoints: Vec<DiscoveryEndpoint>,
    pub expires_at: u64,
}

pub fn canonicalize_record(record: &DiscoveryRecord) -> Result<String, DiscoveryError> {
    validate_record_shape(record)?;
    let mut out = String::new();
    out.push('{');
    out.push_str("\"ver\":");
    out.push_str(&record.ver.to_string());
    out.push_str(",\"namespace_id\":");
    out.push_str(quote_json(record.namespace_id.as_str())?.as_str());
    out.push_str(",\"node_id\":");
    out.push_str(quote_json(record.node_id.as_str())?.as_str());
    out.push_str(",\"endpoints\":[");
    for (index, endpoint) in record.endpoints.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        out.push('{');
        out.push_str("\"transport\":");
        out.push_str(quote_json(endpoint.transport.as_str())?.as_str());
        out.push_str(",\"addr\":");
        out.push_str(quote_json(endpoint.addr.as_str())?.as_str());
        out.push('}');
    }
    out.push(']');
    out.push_str(",\"expires_at\":");
    out.push_str(&record.expires_at.to_string());
    out.push('}');
    Ok(out)
}

pub fn sign_record(
    record: &DiscoveryRecord,
    signing_seed: [u8; 32],
) -> Result<[u8; 64], DiscoveryError> {
    let canonical = canonicalize_record(record)?;
    let signing_key = SigningKey::from_bytes(&signing_seed);
    Ok(signing_key.sign(canonical.as_bytes()).to_bytes())
}

pub fn derive_public_key(signing_seed: [u8; 32]) -> [u8; 32] {
    SigningKey::from_bytes(&signing_seed)
        .verifying_key()
        .to_bytes()
}

pub fn verify_record_signature(
    record: &DiscoveryRecord,
    signature_bytes: [u8; 64],
    public_key: [u8; 32],
) -> Result<(), DiscoveryError> {
    let canonical = canonicalize_record(record)?;
    let verifying_key =
        VerifyingKey::from_bytes(&public_key).map_err(|_| DiscoveryError::InvalidPublicKey)?;
    let signature = Signature::from_bytes(&signature_bytes);
    verifying_key
        .verify(canonical.as_bytes(), &signature)
        .map_err(|_| DiscoveryError::InvalidSignature)
}

fn validate_record_shape(record: &DiscoveryRecord) -> Result<(), DiscoveryError> {
    if record.ver != DISCOVERY_RECORD_VERSION {
        return Err(DiscoveryError::UnsupportedVersion);
    }
    if record.namespace_id.trim().is_empty() {
        return Err(DiscoveryError::InvalidField("namespace_id"));
    }
    if record.node_id.trim().is_empty() {
        return Err(DiscoveryError::InvalidField("node_id"));
    }
    if record.expires_at == 0 {
        return Err(DiscoveryError::InvalidField("expires_at"));
    }
    if record.endpoints.is_empty() {
        return Err(DiscoveryError::InvalidField("endpoints"));
    }
    if record
        .endpoints
        .iter()
        .any(|endpoint| endpoint.transport.trim().is_empty() || endpoint.addr.trim().is_empty())
    {
        return Err(DiscoveryError::InvalidField("endpoints"));
    }
    Ok(())
}

fn quote_json(value: &str) -> Result<String, DiscoveryError> {
    serde_json::to_string(value).map_err(|_| DiscoveryError::InvalidEncoding)
}

pub fn encode_hex(input: &[u8]) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for byte in input {
        let _ = write!(&mut out, "{byte:02x}");
    }
    out
}

pub fn decode_hex(input: &str) -> Result<Vec<u8>, DiscoveryError> {
    if input.len() % 2 != 0 {
        return Err(DiscoveryError::InvalidEncoding);
    }
    let mut out = Vec::with_capacity(input.len() / 2);
    for index in (0..input.len()).step_by(2) {
        let hi = input[index..index + 1]
            .chars()
            .next()
            .and_then(|ch| ch.to_digit(16))
            .ok_or(DiscoveryError::InvalidEncoding)?;
        let lo = input[index + 1..index + 2]
            .chars()
            .next()
            .and_then(|ch| ch.to_digit(16))
            .ok_or(DiscoveryError::InvalidEncoding)?;
        out.push(((hi << 4) | lo) as u8);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::{
        canonicalize_record, derive_public_key, sign_record, verify_record_signature,
        DiscoveryEndpoint, DiscoveryError, DiscoveryRecord,
    };

    fn sample_record() -> DiscoveryRecord {
        DiscoveryRecord {
            ver: 1,
            namespace_id: "namespace-123".to_string(),
            node_id: "node-abc".to_string(),
            endpoints: vec![
                DiscoveryEndpoint {
                    transport: "udp".to_string(),
                    addr: "198.51.100.10:7000".to_string(),
                },
                DiscoveryEndpoint {
                    transport: "relay".to_string(),
                    addr: "relay://default-relay".to_string(),
                },
            ],
            expires_at: 1_700_000_600,
        }
    }

    #[test]
    fn signature_roundtrip_accepts_valid_record() {
        let record = sample_record();
        let seed = [9u8; 32];
        let signature = sign_record(&record, seed).expect("sign");
        verify_record_signature(&record, signature, derive_public_key(seed)).expect("verify");
    }

    #[test]
    fn modified_record_rejects_signature() {
        let record = sample_record();
        let seed = [7u8; 32];
        let signature = sign_record(&record, seed).expect("sign");
        let mut modified = record.clone();
        modified.endpoints[0].addr = "198.51.100.10:7001".to_string();
        let error = verify_record_signature(&modified, signature, derive_public_key(seed))
            .expect_err("must reject modified record");
        assert_eq!(error, DiscoveryError::InvalidSignature);
    }

    #[test]
    fn canonical_encoding_is_stable() {
        let record = sample_record();
        assert_eq!(
            canonicalize_record(&record).expect("canonical"),
            r#"{"ver":1,"namespace_id":"namespace-123","node_id":"node-abc","endpoints":[{"transport":"udp","addr":"198.51.100.10:7000"},{"transport":"relay","addr":"relay://default-relay"}],"expires_at":1700000600}"#
        );
    }
}
