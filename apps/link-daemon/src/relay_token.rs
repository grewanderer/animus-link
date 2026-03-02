use std::{
    fmt::Write as _,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use fabric_identity::default_keystore;
use fabric_relay_proto::{derive_public_key, mint_token, RelayTokenClaims};
use fabric_security::redact::Secret;
use rand_core::{OsRng, RngCore};
use zeroize::Zeroize;

use crate::errors::{ApiError, ApiErrorCode};

pub const DEFAULT_SIGNING_KEY_ID: &str = "relay-token-signing-v1";
pub const DEFAULT_TOKEN_TTL_SECS: u32 = 120;

#[derive(Debug, Clone)]
pub struct RelayTokenIssuerConfig {
    pub signing_key_id: String,
    pub signing_key_file: PathBuf,
    pub signing_seed_hex: Option<String>,
    pub default_ttl_secs: u32,
}

#[derive(Clone)]
pub struct RelayTokenIssuer {
    signing_seed: Secret<[u8; 32]>,
    public_key_hex: String,
    default_ttl_secs: u32,
}

impl std::fmt::Debug for RelayTokenIssuer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RelayTokenIssuer")
            .field("signing_seed", &"[REDACTED]")
            .field("public_key_hex", &self.public_key_hex)
            .field("default_ttl_secs", &self.default_ttl_secs)
            .finish()
    }
}

impl RelayTokenIssuer {
    pub fn load_or_create(config: RelayTokenIssuerConfig) -> Result<Self, ApiError> {
        if config.signing_key_id.trim().is_empty() {
            return Err(ApiError::new(
                ApiErrorCode::InvalidInput,
                "relay token signing key id must be non-empty",
            ));
        }
        if config.default_ttl_secs == 0 {
            return Err(ApiError::new(
                ApiErrorCode::InvalidInput,
                "relay token ttl must be > 0",
            ));
        }

        let mut keystore = default_keystore();
        let mut signing_seed = if let Some(seed_hex) = config.signing_seed_hex.as_deref() {
            decode_seed_hex(seed_hex)?
        } else if let Some(raw) = keystore
            .load_secret(config.signing_key_id.as_str())
            .map_err(|_| {
                ApiError::new(
                    ApiErrorCode::Internal,
                    "failed to load signing key from keystore",
                )
            })?
        {
            if raw.len() != 32 {
                return Err(ApiError::new(
                    ApiErrorCode::Internal,
                    "invalid signing key length in keystore",
                ));
            }
            let mut seed = [0u8; 32];
            seed.copy_from_slice(&raw);
            seed
        } else if config.signing_key_file.exists() {
            load_seed_file(config.signing_key_file.as_path())?
        } else {
            let mut seed = [0u8; 32];
            OsRng.fill_bytes(&mut seed);
            seed
        };

        keystore
            .store_secret(config.signing_key_id.as_str(), &signing_seed)
            .map_err(|_| {
                ApiError::new(
                    ApiErrorCode::Internal,
                    "failed to store signing key in keystore",
                )
            })?;
        persist_seed_file(config.signing_key_file.as_path(), &signing_seed)?;

        let public_key_hex = encode_hex(&derive_public_key(signing_seed));
        let issuer = Self {
            signing_seed: Secret::new(signing_seed),
            public_key_hex,
            default_ttl_secs: config.default_ttl_secs,
        };
        signing_seed.zeroize();
        Ok(issuer)
    }

    pub fn mint_relay_token(
        &self,
        relay_name: &str,
        namespace_id: &str,
        ttl_secs: Option<u32>,
        now_unix_secs: u64,
    ) -> Result<Secret<String>, ApiError> {
        let ttl_secs = ttl_secs.unwrap_or(self.default_ttl_secs);
        if ttl_secs == 0 {
            return Err(ApiError::new(
                ApiErrorCode::InvalidInput,
                "relay token ttl must be > 0",
            ));
        }
        if relay_name.trim().is_empty() {
            return Err(ApiError::new(
                ApiErrorCode::InvalidInput,
                "relay name must be non-empty",
            ));
        }
        if namespace_id.trim().is_empty() {
            return Err(ApiError::new(
                ApiErrorCode::InvalidInput,
                "namespace id must be non-empty",
            ));
        }

        let claims = RelayTokenClaims {
            ver: 1,
            sub: namespace_id.to_string(),
            relay_name: relay_name.to_string(),
            exp: now_unix_secs.saturating_add(u64::from(ttl_secs)),
            nbf: None,
            nonce: None,
            scopes: Some(vec!["relay:allocate".to_string()]),
        };
        let token = mint_token(&claims, *self.signing_seed.expose())
            .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to mint relay token"))?;
        Ok(Secret::new(token))
    }

    pub fn public_key_hex(&self) -> &str {
        self.public_key_hex.as_str()
    }
}

fn load_seed_file(path: &Path) -> Result<[u8; 32], ApiError> {
    let text = fs::read_to_string(path)
        .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to read signing key file"))?;
    decode_seed_hex(text.trim())
}

fn persist_seed_file(path: &Path, seed: &[u8; 32]) -> Result<(), ApiError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| {
            ApiError::new(
                ApiErrorCode::Internal,
                "failed to create signing key directory",
            )
        })?;
    }

    #[cfg(unix)]
    let mut file = {
        use std::os::unix::fs::OpenOptionsExt;
        OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to open signing key file"))?
    };

    #[cfg(not(unix))]
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(path)
        .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to open signing key file"))?;

    let hex = encode_hex(seed);
    file.write_all(hex.as_bytes())
        .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to persist signing key file"))?;
    file.flush()
        .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to flush signing key file"))?;
    Ok(())
}

fn decode_seed_hex(value: &str) -> Result<[u8; 32], ApiError> {
    let raw = decode_hex(value).map_err(|_| {
        ApiError::new(
            ApiErrorCode::InvalidInput,
            "relay token signing seed must be 64 hex chars",
        )
    })?;
    if raw.len() != 32 {
        return Err(ApiError::new(
            ApiErrorCode::InvalidInput,
            "relay token signing seed must be 64 hex chars",
        ));
    }
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&raw);
    Ok(seed)
}

fn encode_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(&mut out, "{byte:02x}");
    }
    out
}

fn decode_hex(value: &str) -> Result<Vec<u8>, ApiError> {
    if value.len() % 2 != 0 {
        return Err(ApiError::new(
            ApiErrorCode::InvalidInput,
            "hex value has odd length",
        ));
    }
    let mut out = Vec::with_capacity(value.len() / 2);
    for index in (0..value.len()).step_by(2) {
        let hi = value[index..index + 1]
            .chars()
            .next()
            .and_then(|ch| ch.to_digit(16))
            .ok_or_else(|| ApiError::new(ApiErrorCode::InvalidInput, "hex value is invalid"))?;
        let lo = value[index + 1..index + 2]
            .chars()
            .next()
            .and_then(|ch| ch.to_digit(16))
            .ok_or_else(|| ApiError::new(ApiErrorCode::InvalidInput, "hex value is invalid"))?;
        out.push(((hi << 4) | lo) as u8);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use relay_server::token::{
        validate_token, Ed25519TokenVerifier, TokenError, TokenValidationContext,
    };

    use super::{RelayTokenIssuer, RelayTokenIssuerConfig, DEFAULT_TOKEN_TTL_SECS};

    fn temp_key_path(name: &str) -> PathBuf {
        let now_ns = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time must be valid")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "animus-link-tests/{name}-{now_ns}/relay-token-key.hex"
        ))
    }

    #[test]
    fn mint_valid_token_and_verify_signature() {
        let key_path = temp_key_path("token-valid");
        let issuer = RelayTokenIssuer::load_or_create(RelayTokenIssuerConfig {
            signing_key_id: "test-key".to_string(),
            signing_key_file: key_path,
            signing_seed_hex: Some(
                "0101010101010101010101010101010101010101010101010101010101010101".to_string(),
            ),
            default_ttl_secs: DEFAULT_TOKEN_TTL_SECS,
        })
        .expect("issuer");

        let verifier =
            Ed25519TokenVerifier::from_public_key_hex(&[issuer.public_key_hex().to_string()])
                .expect("verifier");
        let token = issuer
            .mint_relay_token("relay-eu", "namespace-a", Some(120), 1_700_000_000)
            .expect("mint token");
        let validated = validate_token(
            token.expose().as_str(),
            TokenValidationContext {
                now_unix_secs: 1_700_000_010,
                requested_ttl_secs: 60,
                max_allocation_ttl_secs: 300,
                relay_name: Some("relay-eu"),
                clock_skew_secs: 60,
            },
            &verifier,
        )
        .expect("validate");
        assert_eq!(validated.claims.sub, "namespace-a");
    }

    #[test]
    fn reject_expired_tokens() {
        let key_path = temp_key_path("token-expired");
        let issuer = RelayTokenIssuer::load_or_create(RelayTokenIssuerConfig {
            signing_key_id: "test-key-expired".to_string(),
            signing_key_file: key_path,
            signing_seed_hex: Some(
                "0202020202020202020202020202020202020202020202020202020202020202".to_string(),
            ),
            default_ttl_secs: DEFAULT_TOKEN_TTL_SECS,
        })
        .expect("issuer");
        let verifier =
            Ed25519TokenVerifier::from_public_key_hex(&[issuer.public_key_hex().to_string()])
                .expect("verifier");
        let token = issuer
            .mint_relay_token("relay-eu", "namespace-a", Some(10), 1_700_000_000)
            .expect("mint token");
        let error = validate_token(
            token.expose().as_str(),
            TokenValidationContext {
                now_unix_secs: 1_700_000_100,
                requested_ttl_secs: 60,
                max_allocation_ttl_secs: 300,
                relay_name: Some("relay-eu"),
                clock_skew_secs: 0,
            },
            &verifier,
        )
        .expect_err("must reject expired");
        assert!(matches!(
            error,
            TokenError::InvalidToken(fabric_relay_proto::RelayTokenError::Expired)
        ));
    }

    #[test]
    fn reject_wrong_relay_name() {
        let key_path = temp_key_path("token-wrong-relay");
        let issuer = RelayTokenIssuer::load_or_create(RelayTokenIssuerConfig {
            signing_key_id: "test-key-relay".to_string(),
            signing_key_file: key_path,
            signing_seed_hex: Some(
                "0303030303030303030303030303030303030303030303030303030303030303".to_string(),
            ),
            default_ttl_secs: DEFAULT_TOKEN_TTL_SECS,
        })
        .expect("issuer");
        let verifier =
            Ed25519TokenVerifier::from_public_key_hex(&[issuer.public_key_hex().to_string()])
                .expect("verifier");
        let token = issuer
            .mint_relay_token("relay-eu", "namespace-a", Some(60), 1_700_000_000)
            .expect("mint token");
        let error = validate_token(
            token.expose().as_str(),
            TokenValidationContext {
                now_unix_secs: 1_700_000_010,
                requested_ttl_secs: 60,
                max_allocation_ttl_secs: 300,
                relay_name: Some("relay-us"),
                clock_skew_secs: 60,
            },
            &verifier,
        )
        .expect_err("must reject relay mismatch");
        assert!(matches!(
            error,
            TokenError::InvalidToken(fabric_relay_proto::RelayTokenError::RelayNotAllowed)
        ));
    }

    #[test]
    fn reject_invalid_signature() {
        let key_path = temp_key_path("token-invalid-signature");
        let issuer = RelayTokenIssuer::load_or_create(RelayTokenIssuerConfig {
            signing_key_id: "test-key-sig".to_string(),
            signing_key_file: key_path,
            signing_seed_hex: Some(
                "0404040404040404040404040404040404040404040404040404040404040404".to_string(),
            ),
            default_ttl_secs: DEFAULT_TOKEN_TTL_SECS,
        })
        .expect("issuer");
        let verifier =
            Ed25519TokenVerifier::from_public_key_hex(&[issuer.public_key_hex().to_string()])
                .expect("verifier");
        let token = issuer
            .mint_relay_token("relay-eu", "namespace-a", Some(60), 1_700_000_000)
            .expect("mint token");
        let mut tampered = token.expose().clone();
        let last = tampered.pop().expect("last char");
        tampered.push(if last == '0' { '1' } else { '0' });
        let error = validate_token(
            tampered.as_str(),
            TokenValidationContext {
                now_unix_secs: 1_700_000_010,
                requested_ttl_secs: 60,
                max_allocation_ttl_secs: 300,
                relay_name: Some("relay-eu"),
                clock_skew_secs: 60,
            },
            &verifier,
        )
        .expect_err("must reject signature mismatch");
        assert!(matches!(error, TokenError::InvalidSignature));
    }
}
