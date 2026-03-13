use std::{fmt, io, string::FromUtf8Error};

#[derive(Debug)]
pub enum CliError {
    Config(String),
    Timeout(&'static str),
    Io {
        action: &'static str,
        source: io::Error,
    },
    InvalidResponse(String),
    Api {
        status: u16,
        code: Option<String>,
        message: String,
    },
    RenderJson(serde_json::Error),
    Utf8(FromUtf8Error),
}

impl CliError {
    pub fn config(message: impl Into<String>) -> Self {
        Self::Config(message.into())
    }

    pub fn io(action: &'static str, source: io::Error) -> Self {
        Self::Io { action, source }
    }

    pub fn invalid_response(message: impl Into<String>) -> Self {
        Self::InvalidResponse(message.into())
    }
}

impl fmt::Display for CliError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Config(message) => write!(f, "{message}"),
            Self::Timeout(action) => write!(f, "timed out while trying to {action}"),
            Self::Io { action, source } => write!(f, "failed to {action}: {source}"),
            Self::InvalidResponse(message) => write!(f, "{message}"),
            Self::Api {
                status,
                code,
                message,
            } => match code {
                Some(code) => write!(f, "daemon returned HTTP {status} ({code}): {message}"),
                None => write!(f, "daemon returned HTTP {status}: {message}"),
            },
            Self::RenderJson(source) => write!(f, "failed to render JSON output: {source}"),
            Self::Utf8(source) => write!(f, "daemon returned non-UTF-8 response: {source}"),
        }
    }
}

impl std::error::Error for CliError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            Self::RenderJson(source) => Some(source),
            Self::Utf8(source) => Some(source),
            Self::Config(_) | Self::Timeout(_) | Self::InvalidResponse(_) | Self::Api { .. } => {
                None
            }
        }
    }
}

impl From<FromUtf8Error> for CliError {
    fn from(source: FromUtf8Error) -> Self {
        Self::Utf8(source)
    }
}
