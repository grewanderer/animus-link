use std::fmt;

const REDACTED: &str = "[REDACTED]";

/// Redact sensitive values before log output.
///
/// The output intentionally avoids preserving original prefixes/suffixes.
pub fn redact(input: impl AsRef<str>) -> String {
    let input = input.as_ref();
    if input.is_empty() {
        return REDACTED.to_string();
    }
    format!("{REDACTED}:len={}", input.chars().count())
}

/// Wrapper for values that must never appear in logs.
///
/// `Display` and `Debug` are always redacted.
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub struct Secret<T>(T);

impl<T> Secret<T> {
    pub fn new(value: T) -> Self {
        Self(value)
    }

    pub fn expose(&self) -> &T {
        &self.0
    }

    pub fn into_inner(self) -> T {
        self.0
    }
}

impl<T> fmt::Debug for Secret<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(REDACTED)
    }
}

impl<T> fmt::Display for Secret<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(REDACTED)
    }
}

#[cfg(test)]
mod tests {
    use super::{redact, Secret};

    #[test]
    fn redact_hides_plaintext() {
        let secret = "invite-secret-value";
        let redacted = redact(secret);
        assert!(!redacted.contains(secret));
        assert!(redacted.contains("[REDACTED]"));
    }

    #[test]
    fn secret_display_and_debug_are_redacted() {
        let token = Secret::new("token-value");
        assert_eq!(format!("{token}"), "[REDACTED]");
        assert_eq!(format!("{token:?}"), "[REDACTED]");
    }

    #[test]
    fn secret_expose_retains_original_value() {
        let key = Secret::new(String::from("raw-key"));
        assert_eq!(key.expose(), "raw-key");
    }
}
