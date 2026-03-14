use thiserror::Error;

#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("{0} must not be empty")]
    EmptyField(&'static str),
    #[error("{0} contains unsupported characters")]
    InvalidField(&'static str),
}
