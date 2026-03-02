use thiserror::Error;
#[derive(Debug, Error)]
pub enum FabricError {
    #[error("not implemented")]
    NotImplemented,
}
