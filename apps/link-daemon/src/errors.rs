use std::fmt;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ApiErrorCode {
    InvalidInput,
    NotReady,
    Denied,
    NotFound,
    Conflict,
    Internal,
    MethodNotAllowed,
}

impl ApiErrorCode {
    pub fn http_status(self) -> u16 {
        match self {
            Self::InvalidInput => 400,
            Self::NotReady => 503,
            Self::Denied => 403,
            Self::NotFound => 404,
            Self::Conflict => 409,
            Self::Internal => 500,
            Self::MethodNotAllowed => 405,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ApiError {
    pub code: ApiErrorCode,
    pub message: &'static str,
}

impl ApiError {
    pub const fn new(code: ApiErrorCode, message: &'static str) -> Self {
        Self { code, message }
    }
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code.http_status(), self.message)
    }
}

impl std::error::Error for ApiError {}

#[derive(Debug, Clone, Serialize)]
pub struct ApiErrorBody {
    pub code: ApiErrorCode,
    pub message: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApiEnvelope<T: Serialize> {
    pub api_version: &'static str,
    #[serde(flatten)]
    pub body: T,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApiErrorEnvelope {
    pub api_version: &'static str,
    pub error: ApiErrorBody,
}

pub fn error_envelope(error: &ApiError) -> ApiErrorEnvelope {
    ApiErrorEnvelope {
        api_version: "v1",
        error: ApiErrorBody {
            code: error.code,
            message: error.message,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{ApiError, ApiErrorCode};

    #[test]
    fn api_error_codes_map_to_stable_http_statuses() {
        assert_eq!(ApiErrorCode::InvalidInput.http_status(), 400);
        assert_eq!(ApiErrorCode::MethodNotAllowed.http_status(), 405);
        assert_eq!(ApiErrorCode::NotReady.http_status(), 503);
    }

    #[test]
    fn api_error_display_is_stable() {
        let error = ApiError::new(ApiErrorCode::Denied, "deny by default");
        assert_eq!(error.to_string(), "403: deny by default");
    }
}
