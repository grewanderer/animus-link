use std::fmt;

use crate::redact::{redact, Secret};

#[derive(Clone, PartialEq, Eq)]
pub struct RedactedField(String);

impl fmt::Display for RedactedField {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl fmt::Debug for RedactedField {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EndpointCount(usize);

impl EndpointCount {
    pub fn count(self) -> usize {
        self.0
    }
}

impl fmt::Display for EndpointCount {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.0 == 1 {
            return f.write_str("1 endpoint");
        }
        write!(f, "{} endpoints", self.0)
    }
}

pub fn secret<T>(value: T) -> Secret<T> {
    Secret::new(value)
}

pub fn redacted_field(value: impl AsRef<str>) -> RedactedField {
    RedactedField(redact(value))
}

pub fn endpoint_count<T>(endpoints: &[T]) -> EndpointCount {
    EndpointCount(endpoints.len())
}

#[cfg(test)]
mod tests {
    use std::{
        io::{self, Write},
        sync::{Arc, Mutex},
    };

    use tracing_subscriber::fmt::MakeWriter;

    use super::{endpoint_count, redacted_field, secret};

    #[derive(Clone, Default)]
    struct SharedBuffer {
        inner: Arc<Mutex<Vec<u8>>>,
    }

    impl SharedBuffer {
        fn content(&self) -> String {
            let bytes = self.inner.lock().expect("buffer lock poisoned").clone();
            String::from_utf8(bytes).expect("captured logs must be utf8")
        }
    }

    struct BufferWriter {
        inner: Arc<Mutex<Vec<u8>>>,
    }

    impl Write for BufferWriter {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.inner
                .lock()
                .expect("buffer lock poisoned")
                .extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl<'a> MakeWriter<'a> for SharedBuffer {
        type Writer = BufferWriter;

        fn make_writer(&'a self) -> Self::Writer {
            BufferWriter {
                inner: Arc::clone(&self.inner),
            }
        }
    }

    #[test]
    fn no_secrets_in_logs() {
        let output = SharedBuffer::default();
        let subscriber = tracing_subscriber::fmt()
            .with_ansi(false)
            .without_time()
            .with_target(false)
            .with_writer(output.clone())
            .finish();
        let dispatch = tracing::Dispatch::new(subscriber);

        tracing::dispatcher::with_default(&dispatch, || {
            let relay_token = "token-super-secret";
            let invite_secret = "invite-super-secret";
            let endpoints = vec!["203.0.113.10:7777", "203.0.113.11:7777"];

            tracing::info!(
                token = %secret(relay_token),
                invite = %redacted_field(invite_secret),
                relay_endpoints = %endpoint_count(&endpoints),
                "security logging"
            );
        });

        let logs = output.content();
        assert!(!logs.contains("token-super-secret"));
        assert!(!logs.contains("invite-super-secret"));
        assert!(!logs.contains("203.0.113.10:7777"));
        assert!(logs.contains("2 endpoints"));
    }
}
