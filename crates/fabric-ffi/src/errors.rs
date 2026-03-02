use thiserror::Error;

#[derive(Debug, Error, Clone, Copy, PartialEq, Eq)]
pub enum FabricError {
    #[error("invalid input")]
    InvalidInput,
    #[error("not ready")]
    NotReady,
    #[error("internal")]
    Internal,
}

impl FabricError {
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidInput => "InvalidInput",
            Self::NotReady => "NotReady",
            Self::Internal => "Internal",
        }
    }
}
