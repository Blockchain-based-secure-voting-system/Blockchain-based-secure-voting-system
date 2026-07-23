use thiserror::Error;

#[derive(Error, Debug, PartialEq, Eq)]
pub enum CryptoError {
    #[error("Failed to deserialize point or scalar: {0}")]
    DeserializationError(String),

    #[error("Discrete log search exceeded maximum bound ({0})")]
    DiscreteLogNotFound(u64),

    #[error("Invalid Chaum-Pedersen zero-knowledge proof verification")]
    InvalidProof,

    #[error("Point is not on the curve G1 or in the prime order subgroup")]
    InvalidCurvePoint,

    #[error("Decrypted tally point does not match claimed value")]
    TallyMismatch,
}
