use std::fmt::Write as _;

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const RELAY_TOKEN_PREFIX: &str = "animus://rtok/v1/";
pub const RELAY_TOKEN_VERSION: u8 = 1;
pub const RELAY_TOKEN_MAX_SIZE: usize = 2048;
pub const DEFAULT_CLOCK_SKEW_SECS: u64 = 60;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RelayTokenClaims {
    pub ver: u8,
    pub sub: String,
    pub relay_name: String,
    pub exp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nbf: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nonce: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scopes: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedRelayToken {
    pub claims: RelayTokenClaims,
    pub canonical_payload: String,
    pub signature: [u8; 64],
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum RelayTokenError {
    #[error("token is empty")]
    EmptyToken,
    #[error("token exceeds max size")]
    TokenTooLarge,
    #[error("token format is invalid")]
    InvalidFormat,
    #[error("token version is unsupported")]
    UnsupportedVersion,
    #[error("token payload is not canonical")]
    NonCanonicalPayload,
    #[error("token payload encoding is invalid")]
    InvalidPayloadEncoding,
    #[error("token signature encoding is invalid")]
    InvalidSignatureEncoding,
    #[error("token signing key is invalid")]
    InvalidSigningKey,
    #[error("token public key is invalid")]
    InvalidPublicKey,
    #[error("token signature verification failed")]
    InvalidSignature,
    #[error("token subject is invalid")]
    InvalidSubject,
    #[error("token relay name is invalid")]
    InvalidRelayName,
    #[error("token expiry is invalid")]
    InvalidExpiry,
    #[error("token not-before is invalid")]
    InvalidNotBefore,
    #[error("token nonce is invalid")]
    InvalidNonce,
    #[error("token scopes are invalid")]
    InvalidScopes,
    #[error("token relay is not allowed")]
    RelayNotAllowed,
    #[error("token is not valid yet")]
    NotYetValid,
    #[error("token has expired")]
    Expired,
}

pub fn mint_token(
    claims: &RelayTokenClaims,
    signing_seed: [u8; 32],
) -> Result<String, RelayTokenError> {
    validate_claims_shape(claims)?;
    let canonical_payload = canonicalize_claims(claims)?;
    let signing_key = SigningKey::from_bytes(&signing_seed);
    let signature = signing_key.sign(canonical_payload.as_bytes()).to_bytes();
    let token = format!(
        "{}{}.{}",
        RELAY_TOKEN_PREFIX,
        encode_hex(canonical_payload.as_bytes()),
        encode_hex(&signature)
    );
    if token.len() > RELAY_TOKEN_MAX_SIZE {
        return Err(RelayTokenError::TokenTooLarge);
    }
    Ok(token)
}

pub fn derive_public_key(signing_seed: [u8; 32]) -> [u8; 32] {
    SigningKey::from_bytes(&signing_seed)
        .verifying_key()
        .to_bytes()
}

pub fn parse_token(token: &str) -> Result<ParsedRelayToken, RelayTokenError> {
    let token = token.trim();
    if token.is_empty() {
        return Err(RelayTokenError::EmptyToken);
    }
    if token.len() > RELAY_TOKEN_MAX_SIZE {
        return Err(RelayTokenError::TokenTooLarge);
    }

    let encoded = token
        .strip_prefix(RELAY_TOKEN_PREFIX)
        .ok_or(RelayTokenError::InvalidFormat)?;
    let (payload_hex, signature_hex) = encoded
        .split_once('.')
        .ok_or(RelayTokenError::InvalidFormat)?;
    if payload_hex.is_empty() || signature_hex.is_empty() {
        return Err(RelayTokenError::InvalidFormat);
    }

    let payload_bytes =
        decode_hex(payload_hex).map_err(|_| RelayTokenError::InvalidPayloadEncoding)?;
    let canonical_payload =
        String::from_utf8(payload_bytes).map_err(|_| RelayTokenError::InvalidPayloadEncoding)?;
    let claims: RelayTokenClaims = serde_json::from_str(canonical_payload.as_str())
        .map_err(|_| RelayTokenError::InvalidFormat)?;
    validate_claims_shape(&claims)?;
    if canonical_payload != canonicalize_claims(&claims)? {
        return Err(RelayTokenError::NonCanonicalPayload);
    }

    let signature_bytes =
        decode_hex(signature_hex).map_err(|_| RelayTokenError::InvalidSignatureEncoding)?;
    if signature_bytes.len() != 64 {
        return Err(RelayTokenError::InvalidSignatureEncoding);
    }
    let mut signature = [0u8; 64];
    signature.copy_from_slice(&signature_bytes);

    Ok(ParsedRelayToken {
        claims,
        canonical_payload,
        signature,
    })
}

pub fn verify_signature(
    parsed: &ParsedRelayToken,
    public_key: [u8; 32],
) -> Result<(), RelayTokenError> {
    let verifying_key =
        VerifyingKey::from_bytes(&public_key).map_err(|_| RelayTokenError::InvalidPublicKey)?;
    let signature = Signature::from_bytes(&parsed.signature);
    verifying_key
        .verify(parsed.canonical_payload.as_bytes(), &signature)
        .map_err(|_| RelayTokenError::InvalidSignature)
}

pub fn validate_claims_time_and_relay(
    claims: &RelayTokenClaims,
    now_unix_secs: u64,
    skew_secs: u64,
    expected_relay_name: Option<&str>,
) -> Result<(), RelayTokenError> {
    if let Some(expected_relay_name) = expected_relay_name {
        if claims.relay_name != expected_relay_name {
            return Err(RelayTokenError::RelayNotAllowed);
        }
    }

    if let Some(nbf) = claims.nbf {
        if now_unix_secs.saturating_add(skew_secs) < nbf {
            return Err(RelayTokenError::NotYetValid);
        }
    }

    if now_unix_secs > claims.exp.saturating_add(skew_secs) {
        return Err(RelayTokenError::Expired);
    }

    Ok(())
}

pub fn remaining_ttl_with_skew_secs(
    claims: &RelayTokenClaims,
    now_unix_secs: u64,
    skew_secs: u64,
) -> u64 {
    claims
        .exp
        .saturating_add(skew_secs)
        .saturating_sub(now_unix_secs)
}

pub fn canonicalize_claims(claims: &RelayTokenClaims) -> Result<String, RelayTokenError> {
    validate_claims_shape(claims)?;
    let mut out = String::new();
    out.push('{');
    out.push_str("\"ver\":");
    out.push_str(&claims.ver.to_string());
    out.push_str(",\"sub\":");
    out.push_str(quote_json(claims.sub.as_str())?.as_str());
    out.push_str(",\"relay_name\":");
    out.push_str(quote_json(claims.relay_name.as_str())?.as_str());
    out.push_str(",\"exp\":");
    out.push_str(&claims.exp.to_string());

    if let Some(nbf) = claims.nbf {
        out.push_str(",\"nbf\":");
        out.push_str(&nbf.to_string());
    }

    if let Some(nonce) = claims.nonce.as_deref() {
        out.push_str(",\"nonce\":");
        out.push_str(quote_json(nonce)?.as_str());
    }

    if let Some(scopes) = claims.scopes.as_ref() {
        out.push_str(",\"scopes\":[");
        for (index, scope) in scopes.iter().enumerate() {
            if index > 0 {
                out.push(',');
            }
            out.push_str(quote_json(scope.as_str())?.as_str());
        }
        out.push(']');
    }

    out.push('}');
    Ok(out)
}

fn validate_claims_shape(claims: &RelayTokenClaims) -> Result<(), RelayTokenError> {
    if claims.ver != RELAY_TOKEN_VERSION {
        return Err(RelayTokenError::UnsupportedVersion);
    }
    if claims.sub.trim().is_empty() {
        return Err(RelayTokenError::InvalidSubject);
    }
    if claims.relay_name.trim().is_empty() {
        return Err(RelayTokenError::InvalidRelayName);
    }
    if claims.exp == 0 {
        return Err(RelayTokenError::InvalidExpiry);
    }
    if let Some(nbf) = claims.nbf {
        if nbf == 0 || nbf > claims.exp {
            return Err(RelayTokenError::InvalidNotBefore);
        }
    }
    if claims
        .nonce
        .as_deref()
        .is_some_and(|nonce| nonce.trim().is_empty())
    {
        return Err(RelayTokenError::InvalidNonce);
    }
    if claims.scopes.as_ref().is_some_and(|scopes| {
        scopes.is_empty() || scopes.iter().any(|scope| scope.trim().is_empty())
    }) {
        return Err(RelayTokenError::InvalidScopes);
    }
    Ok(())
}

fn quote_json(value: &str) -> Result<String, RelayTokenError> {
    serde_json::to_string(value).map_err(|_| RelayTokenError::InvalidFormat)
}

fn encode_hex(input: &[u8]) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for byte in input {
        let _ = write!(&mut out, "{byte:02x}");
    }
    out
}

fn decode_hex(input: &str) -> Result<Vec<u8>, RelayTokenError> {
    if input.len() % 2 != 0 {
        return Err(RelayTokenError::InvalidFormat);
    }

    let mut out = Vec::with_capacity(input.len() / 2);
    for index in (0..input.len()).step_by(2) {
        let hi = input[index..index + 1]
            .chars()
            .next()
            .and_then(|ch| ch.to_digit(16))
            .ok_or(RelayTokenError::InvalidFormat)?;
        let lo = input[index + 1..index + 2]
            .chars()
            .next()
            .and_then(|ch| ch.to_digit(16))
            .ok_or(RelayTokenError::InvalidFormat)?;
        out.push(((hi << 4) | lo) as u8);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use ed25519_dalek::Signer;

    use super::{
        canonicalize_claims, derive_public_key, mint_token, parse_token,
        validate_claims_time_and_relay, verify_signature, RelayTokenClaims, RelayTokenError,
    };

    #[test]
    fn signed_token_roundtrip_and_verify() {
        let claims = RelayTokenClaims {
            ver: 1,
            sub: "namespace-a".to_string(),
            relay_name: "relay-eu".to_string(),
            exp: 1_700_000_600,
            nbf: Some(1_700_000_000),
            nonce: Some("n-123".to_string()),
            scopes: Some(vec!["relay:allocate".to_string()]),
        };
        let seed = [7u8; 32];
        let token = mint_token(&claims, seed).expect("token");
        let parsed = parse_token(&token).expect("parse");
        assert_eq!(parsed.claims, claims);
        verify_signature(&parsed, derive_public_key(seed)).expect("signature");
    }

    #[test]
    fn modified_payload_rejects_signature() {
        let claims = RelayTokenClaims {
            ver: 1,
            sub: "namespace-a".to_string(),
            relay_name: "relay-eu".to_string(),
            exp: 1_700_000_600,
            nbf: None,
            nonce: None,
            scopes: None,
        };
        let seed = [3u8; 32];
        let token = mint_token(&claims, seed).expect("token");
        let mut tampered = token.clone();
        let last = tampered.pop().expect("last char");
        tampered.push(if last == '0' { '1' } else { '0' });
        let parsed = parse_token(tampered.as_str()).expect("parse tampered");
        let err =
            verify_signature(&parsed, derive_public_key(seed)).expect_err("signature mismatch");
        assert_eq!(err, RelayTokenError::InvalidSignature);
    }

    #[test]
    fn non_canonical_payload_is_rejected() {
        let non_canonical_payload = r#"{"sub":"x","ver":1,"relay_name":"relay","exp":1700000600}"#;
        let seed = [5u8; 32];
        let canonical_claims = RelayTokenClaims {
            ver: 1,
            sub: "x".to_string(),
            relay_name: "relay".to_string(),
            exp: 1_700_000_600,
            nbf: None,
            nonce: None,
            scopes: None,
        };
        let key = ed25519_dalek::SigningKey::from_bytes(&seed);
        let signature = key.sign(non_canonical_payload.as_bytes()).to_bytes();
        let token = format!(
            "{}{}.{}",
            super::RELAY_TOKEN_PREFIX,
            super::encode_hex(non_canonical_payload.as_bytes()),
            super::encode_hex(&signature)
        );
        let err = parse_token(token.as_str()).expect_err("non canonical must fail");
        assert_eq!(err, RelayTokenError::NonCanonicalPayload);
        assert_eq!(
            canonicalize_claims(&canonical_claims).expect("canonical"),
            r#"{"ver":1,"sub":"x","relay_name":"relay","exp":1700000600}"#
        );
    }

    #[test]
    fn time_and_relay_validation_enforced() {
        let claims = RelayTokenClaims {
            ver: 1,
            sub: "namespace-a".to_string(),
            relay_name: "relay-eu".to_string(),
            exp: 1_700_000_600,
            nbf: Some(1_700_000_100),
            nonce: None,
            scopes: None,
        };

        let not_yet_valid =
            validate_claims_time_and_relay(&claims, 1_700_000_000, 30, Some("relay-eu"))
                .expect_err("nbf should reject");
        assert_eq!(not_yet_valid, RelayTokenError::NotYetValid);

        validate_claims_time_and_relay(&claims, 1_700_000_070, 30, Some("relay-eu"))
            .expect("skew allows near-future nbf");

        let relay_err =
            validate_claims_time_and_relay(&claims, 1_700_000_200, 60, Some("relay-us"))
                .expect_err("relay mismatch");
        assert_eq!(relay_err, RelayTokenError::RelayNotAllowed);

        let expired = validate_claims_time_and_relay(&claims, 1_700_000_700, 60, Some("relay-eu"))
            .expect_err("expired");
        assert_eq!(expired, RelayTokenError::Expired);
    }
}
