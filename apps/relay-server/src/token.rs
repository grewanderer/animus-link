use std::fmt::Write as _;

use fabric_relay_proto::{
    parse_token as parse_signed_token, remaining_ttl_with_skew_secs,
    validate_claims_time_and_relay, verify_signature as verify_signed_token, ParsedRelayToken,
    RelayTokenClaims, RelayTokenError, DEFAULT_CLOCK_SKEW_SECS,
};

pub type TokenClaims = RelayTokenClaims;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedToken {
    pub claims: TokenClaims,
    pub granted_ttl_secs: u32,
    pub expires_at_unix_secs: u64,
    pub issuer_id: String,
    pub payload_bytes: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TokenError {
    InvalidToken(RelayTokenError),
    InvalidRequestedTtl,
    SignatureVerificationUnavailable,
    InvalidSignature,
}

pub trait TokenSignatureVerifier {
    fn verify(&self, token: &ParsedRelayToken) -> Result<String, TokenError>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct RejectingTokenVerifier;

impl TokenSignatureVerifier for RejectingTokenVerifier {
    fn verify(&self, _token: &ParsedRelayToken) -> Result<String, TokenError> {
        Err(TokenError::SignatureVerificationUnavailable)
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct DevOnlyTokenVerifier;

impl TokenSignatureVerifier for DevOnlyTokenVerifier {
    fn verify(&self, _token: &ParsedRelayToken) -> Result<String, TokenError> {
        Ok("dev_unsigned".to_string())
    }
}

#[derive(Debug, Clone)]
pub struct Ed25519TokenVerifier {
    trusted_public_keys: Vec<TrustedPublicKey>,
}

#[derive(Debug, Clone)]
struct TrustedPublicKey {
    key: [u8; 32],
    issuer_id: String,
}

impl Ed25519TokenVerifier {
    pub fn from_public_key_hex(public_keys_hex: &[String]) -> Result<Self, TokenError> {
        let mut trusted_public_keys = Vec::with_capacity(public_keys_hex.len());
        for value in public_keys_hex {
            let raw = decode_hex(value.as_str()).map_err(|_| TokenError::InvalidSignature)?;
            if raw.len() != 32 {
                return Err(TokenError::InvalidSignature);
            }
            let mut key = [0u8; 32];
            key.copy_from_slice(&raw);
            trusted_public_keys.push(TrustedPublicKey {
                key,
                issuer_id: short_issuer_id(&key),
            });
        }

        if trusted_public_keys.is_empty() {
            return Err(TokenError::SignatureVerificationUnavailable);
        }

        Ok(Self {
            trusted_public_keys,
        })
    }
}

impl TokenSignatureVerifier for Ed25519TokenVerifier {
    fn verify(&self, token: &ParsedRelayToken) -> Result<String, TokenError> {
        for key in &self.trusted_public_keys {
            if verify_signed_token(token, key.key).is_ok() {
                return Ok(key.issuer_id.clone());
            }
        }
        Err(TokenError::InvalidSignature)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct TokenValidationContext<'a> {
    pub now_unix_secs: u64,
    pub requested_ttl_secs: u32,
    pub max_allocation_ttl_secs: u32,
    pub relay_name: Option<&'a str>,
    pub clock_skew_secs: u64,
}

pub fn parse_token(token: &str) -> Result<TokenClaims, TokenError> {
    parse_signed_token(token)
        .map(|parsed| parsed.claims)
        .map_err(TokenError::InvalidToken)
}

pub fn validate_token(
    token: &str,
    context: TokenValidationContext<'_>,
    verifier: &dyn TokenSignatureVerifier,
) -> Result<ValidatedToken, TokenError> {
    if context.requested_ttl_secs == 0 {
        return Err(TokenError::InvalidRequestedTtl);
    }

    let parsed = parse_signed_token(token).map_err(TokenError::InvalidToken)?;
    let issuer_id = verifier.verify(&parsed)?;

    validate_claims_time_and_relay(
        &parsed.claims,
        context.now_unix_secs,
        context.clock_skew_secs,
        context.relay_name,
    )
    .map_err(TokenError::InvalidToken)?;

    let remaining = remaining_ttl_with_skew_secs(
        &parsed.claims,
        context.now_unix_secs,
        context.clock_skew_secs,
    );
    let remaining_ttl = remaining.min(u64::from(u32::MAX)) as u32;
    let max_ttl = context.max_allocation_ttl_secs.max(1);
    let granted_ttl = context.requested_ttl_secs.min(max_ttl).min(remaining_ttl);
    if granted_ttl == 0 {
        return Err(TokenError::InvalidToken(RelayTokenError::Expired));
    }

    Ok(ValidatedToken {
        claims: parsed.claims,
        granted_ttl_secs: granted_ttl,
        expires_at_unix_secs: context.now_unix_secs + u64::from(granted_ttl),
        issuer_id,
        payload_bytes: parsed.canonical_payload.len(),
    })
}

impl Default for TokenValidationContext<'_> {
    fn default() -> Self {
        Self {
            now_unix_secs: 0,
            requested_ttl_secs: 0,
            max_allocation_ttl_secs: 0,
            relay_name: None,
            clock_skew_secs: DEFAULT_CLOCK_SKEW_SECS,
        }
    }
}

fn decode_hex(input: &str) -> Result<Vec<u8>, TokenError> {
    if input.len() % 2 != 0 {
        return Err(TokenError::InvalidSignature);
    }
    let mut out = Vec::with_capacity(input.len() / 2);
    for i in (0..input.len()).step_by(2) {
        let hi = input[i..i + 1]
            .chars()
            .next()
            .and_then(|ch| ch.to_digit(16))
            .ok_or(TokenError::InvalidSignature)?;
        let lo = input[i + 1..i + 2]
            .chars()
            .next()
            .and_then(|ch| ch.to_digit(16))
            .ok_or(TokenError::InvalidSignature)?;
        out.push(((hi << 4) | lo) as u8);
    }
    Ok(out)
}

fn short_issuer_id(key: &[u8; 32]) -> String {
    let mut out = String::with_capacity(11);
    out.push_str("issuer_");
    for byte in key.iter().take(4) {
        let _ = write!(&mut out, "{byte:02x}");
    }
    out
}

#[cfg(test)]
mod tests {
    use std::fmt::Write as _;

    use super::{
        parse_token, validate_token, DevOnlyTokenVerifier, Ed25519TokenVerifier,
        RejectingTokenVerifier, TokenClaims, TokenError, TokenValidationContext,
    };
    use fabric_relay_proto::{derive_public_key, mint_token, RelayTokenClaims, RelayTokenError};

    const TEST_SEED: [u8; 32] = [7; 32];

    fn valid_token(exp: u64, relay_name: &str) -> String {
        mint_token(
            &RelayTokenClaims {
                ver: 1,
                sub: "namespace-a".to_string(),
                relay_name: relay_name.to_string(),
                exp,
                nbf: None,
                nonce: Some("nonce-1".to_string()),
                scopes: Some(vec!["relay:allocate".to_string()]),
            },
            TEST_SEED,
        )
        .expect("mint token")
    }

    fn verifier() -> Ed25519TokenVerifier {
        let public_key_hex = {
            let mut out = String::new();
            for byte in derive_public_key(TEST_SEED) {
                let _ = write!(&mut out, "{byte:02x}");
            }
            out
        };
        Ed25519TokenVerifier::from_public_key_hex(&[public_key_hex]).expect("verifier")
    }

    #[test]
    fn parse_token_extracts_claims() {
        let token = valid_token(1_700_000_600, "relay-eu");
        let claims = parse_token(token.as_str()).expect("valid token");
        assert_eq!(
            claims,
            TokenClaims {
                ver: 1,
                sub: "namespace-a".to_string(),
                relay_name: "relay-eu".to_string(),
                exp: 1_700_000_600,
                nbf: None,
                nonce: Some("nonce-1".to_string()),
                scopes: Some(vec!["relay:allocate".to_string()]),
            }
        );
    }

    #[test]
    fn validate_token_rejects_expired_tokens() {
        let token = valid_token(1_699_999_999, "relay-eu");
        let error = validate_token(
            token.as_str(),
            TokenValidationContext {
                now_unix_secs: 1_700_000_000,
                requested_ttl_secs: 60,
                max_allocation_ttl_secs: 300,
                relay_name: Some("relay-eu"),
                clock_skew_secs: 0,
            },
            &verifier(),
        )
        .expect_err("expired token must fail");
        assert_eq!(error, TokenError::InvalidToken(RelayTokenError::Expired));
    }

    #[test]
    fn validate_token_rejects_invalid_signature_by_default() {
        let token = valid_token(1_700_000_600, "relay-eu");
        let error = validate_token(
            token.as_str(),
            TokenValidationContext {
                now_unix_secs: 1_700_000_000,
                requested_ttl_secs: 60,
                max_allocation_ttl_secs: 300,
                relay_name: Some("relay-eu"),
                clock_skew_secs: 60,
            },
            &RejectingTokenVerifier,
        )
        .expect_err("signature verification must fail by default");
        assert_eq!(error, TokenError::SignatureVerificationUnavailable);
    }

    #[test]
    fn validate_token_enforces_relay_allowlist_and_ttl_cap() {
        let token = valid_token(1_700_000_600, "relay-eu");
        let validated = validate_token(
            token.as_str(),
            TokenValidationContext {
                now_unix_secs: 1_700_000_000,
                requested_ttl_secs: 240,
                max_allocation_ttl_secs: 120,
                relay_name: Some("relay-eu"),
                clock_skew_secs: 0,
            },
            &verifier(),
        )
        .expect("token should validate");

        assert_eq!(validated.granted_ttl_secs, 120);
        assert_eq!(validated.expires_at_unix_secs, 1_700_000_120);

        let relay_mismatch = validate_token(
            token.as_str(),
            TokenValidationContext {
                now_unix_secs: 1_700_000_000,
                requested_ttl_secs: 60,
                max_allocation_ttl_secs: 300,
                relay_name: Some("relay-us"),
                clock_skew_secs: 60,
            },
            &verifier(),
        )
        .expect_err("relay mismatch must fail");
        assert_eq!(
            relay_mismatch,
            TokenError::InvalidToken(RelayTokenError::RelayNotAllowed)
        );
    }

    #[test]
    fn validate_token_rejects_invalid_signature() {
        let token = valid_token(1_700_000_600, "relay-eu");
        let mut tampered = token.clone();
        let last = tampered.pop().expect("last char");
        tampered.push(if last == '0' { '1' } else { '0' });
        let err = validate_token(
            tampered.as_str(),
            TokenValidationContext {
                now_unix_secs: 1_700_000_000,
                requested_ttl_secs: 60,
                max_allocation_ttl_secs: 300,
                relay_name: Some("relay-eu"),
                clock_skew_secs: 60,
            },
            &verifier(),
        )
        .expect_err("signature mismatch");
        assert_eq!(err, TokenError::InvalidSignature);
    }

    #[test]
    fn dev_verifier_is_explicit_bypass_only() {
        let token = valid_token(1_700_000_600, "relay-eu");
        let mut tampered = token.clone();
        let last = tampered.pop().expect("last char");
        tampered.push(if last == '0' { '1' } else { '0' });
        validate_token(
            tampered.as_str(),
            TokenValidationContext {
                now_unix_secs: 1_700_000_000,
                requested_ttl_secs: 60,
                max_allocation_ttl_secs: 300,
                relay_name: Some("relay-eu"),
                clock_skew_secs: 60,
            },
            &DevOnlyTokenVerifier,
        )
        .expect("dev verifier bypass");
    }
}
