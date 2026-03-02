use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use fabric_security::redact::Secret;

use crate::errors::{ApiError, ApiErrorCode};

pub const INVITE_PREFIX: &str = "animus://invite/v1/";
pub const INVITE_NAMESPACE_LEN: usize = 32;
pub const INVITE_SECRET_LEN: usize = 32;
pub const INVITE_DEFAULT_TTL_SECS: u64 = 3_600;

static INVITE_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invite {
    pub namespace_id: String,
    pub secret: Secret<String>,
    pub exp_unix_secs: u64,
}

impl Invite {
    pub fn to_string_repr(&self) -> String {
        format!(
            "{INVITE_PREFIX}{}.{}.{}",
            self.namespace_id,
            self.secret.expose(),
            self.exp_unix_secs
        )
    }
}

pub fn generate_invite(now_unix_secs: u64) -> Invite {
    let counter = INVITE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let entropy_base = now_unix_secs ^ counter ^ u64::from(std::process::id());
    let namespace_id = format!(
        "{:016x}{:016x}",
        mix64(entropy_base),
        mix64(entropy_base ^ 0xa5)
    );
    let secret_seed = entropy_base.rotate_left(11) ^ 0x9e37_79b9_7f4a_7c15;
    let secret = format!(
        "{:016x}{:016x}",
        mix64(secret_seed),
        mix64(secret_seed ^ 0x5a)
    );

    Invite {
        namespace_id,
        secret: Secret::new(secret),
        exp_unix_secs: now_unix_secs.saturating_add(INVITE_DEFAULT_TTL_SECS),
    }
}

pub fn parse_invite(invite: &str, now_unix_secs: u64) -> Result<Invite, ApiError> {
    let payload = invite
        .strip_prefix(INVITE_PREFIX)
        .ok_or_else(|| ApiError::new(ApiErrorCode::InvalidInput, "invalid invite format"))?;
    let mut parts = payload.split('.');

    let namespace_id = parts
        .next()
        .ok_or_else(|| ApiError::new(ApiErrorCode::InvalidInput, "invalid invite format"))?;
    let secret = parts
        .next()
        .ok_or_else(|| ApiError::new(ApiErrorCode::InvalidInput, "invalid invite format"))?;
    let exp = parts
        .next()
        .ok_or_else(|| ApiError::new(ApiErrorCode::InvalidInput, "invalid invite format"))?;
    if parts.next().is_some() {
        return Err(ApiError::new(
            ApiErrorCode::InvalidInput,
            "invalid invite format",
        ));
    }

    if !is_hex_with_len(namespace_id, INVITE_NAMESPACE_LEN)
        || !is_hex_with_len(secret, INVITE_SECRET_LEN)
    {
        return Err(ApiError::new(
            ApiErrorCode::InvalidInput,
            "invalid invite format",
        ));
    }

    let exp_unix_secs = exp
        .parse::<u64>()
        .map_err(|_| ApiError::new(ApiErrorCode::InvalidInput, "invalid invite format"))?;
    if now_unix_secs >= exp_unix_secs {
        return Err(ApiError::new(ApiErrorCode::InvalidInput, "invite expired"));
    }

    Ok(Invite {
        namespace_id: namespace_id.to_string(),
        secret: Secret::new(secret.to_string()),
        exp_unix_secs,
    })
}

pub fn now_unix_secs() -> u64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_secs(),
        Err(_) => 0,
    }
}

fn is_hex_with_len(value: &str, expected_len: usize) -> bool {
    value.len() == expected_len && value.chars().all(|c| c.is_ascii_hexdigit())
}

fn mix64(mut x: u64) -> u64 {
    x ^= x >> 30;
    x = x.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    x ^= x >> 27;
    x = x.wrapping_mul(0x94d0_49bb_1331_11eb);
    x ^ (x >> 31)
}

#[cfg(test)]
mod tests {
    use super::{generate_invite, parse_invite, INVITE_PREFIX};

    #[test]
    fn generated_invite_roundtrips() {
        let invite = generate_invite(1_700_000_000);
        let text = invite.to_string_repr();
        let parsed = parse_invite(&text, 1_700_000_001).expect("invite should parse");
        assert_eq!(parsed.namespace_id, invite.namespace_id);
        assert_eq!(parsed.secret.expose(), invite.secret.expose());
    }

    #[test]
    fn parse_rejects_expired_invite() {
        let invite = format!(
            "{INVITE_PREFIX}0123456789abcdef0123456789abcdef.abcdef0123456789abcdef0123456789.1700000000"
        );
        let error = parse_invite(&invite, 1_700_000_001).expect_err("expired invite must fail");
        assert_eq!(error.message, "invite expired");
    }
}
