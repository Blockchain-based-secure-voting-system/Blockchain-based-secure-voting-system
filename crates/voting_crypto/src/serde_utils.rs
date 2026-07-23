use crate::error::CryptoError;
use ark_bn254::{Fr, G1Affine, G1Projective};
use ark_ec::CurveGroup;
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};

/// Serialize a G1 projective point into compressed hex string
pub fn g1_to_hex(point: &G1Projective) -> String {
    let mut bytes = Vec::new();
    point
        .serialize_compressed(&mut bytes)
        .expect("G1 serialization should not fail");
    hex::encode(bytes)
}

/// Deserialize a G1 projective point from compressed hex string
pub fn g1_from_hex(hex_str: &str) -> Result<G1Projective, CryptoError> {
    let bytes = hex::decode(hex_str)
        .map_err(|e| CryptoError::DeserializationError(format!("Invalid hex string: {}", e)))?;
    let affine = G1Affine::deserialize_compressed(&bytes[..])
        .map_err(|e| CryptoError::DeserializationError(format!("Invalid G1 point bytes: {}", e)))?;
    Ok(affine.into_group())
}

/// Serialize a G1 projective point to compressed byte vector
pub fn g1_to_bytes(point: &G1Projective) -> Vec<u8> {
    let mut bytes = Vec::new();
    point
        .serialize_compressed(&mut bytes)
        .expect("G1 serialization should not fail");
    bytes
}

/// Deserialize a G1 projective point from compressed bytes
pub fn g1_from_bytes(bytes: &[u8]) -> Result<G1Projective, CryptoError> {
    let affine = G1Affine::deserialize_compressed(bytes)
        .map_err(|e| CryptoError::DeserializationError(format!("Invalid G1 point bytes: {}", e)))?;
    Ok(affine.into_group())
}

/// Serialize an Fr scalar to hex string
pub fn fr_to_hex(scalar: &Fr) -> String {
    let mut bytes = Vec::new();
    scalar
        .serialize_compressed(&mut bytes)
        .expect("Fr serialization should not fail");
    hex::encode(bytes)
}

/// Deserialize an Fr scalar from hex string
pub fn fr_from_hex(hex_str: &str) -> Result<Fr, CryptoError> {
    let bytes = hex::decode(hex_str)
        .map_err(|e| CryptoError::DeserializationError(format!("Invalid hex string: {}", e)))?;
    Fr::deserialize_compressed(&bytes[..])
        .map_err(|e| CryptoError::DeserializationError(format!("Invalid Fr scalar bytes: {}", e)))
}

/// Serialize an Fr scalar to bytes
pub fn fr_to_bytes(scalar: &Fr) -> Vec<u8> {
    let mut bytes = Vec::new();
    scalar
        .serialize_compressed(&mut bytes)
        .expect("Fr serialization should not fail");
    bytes
}

/// Deserialize an Fr scalar from bytes
pub fn fr_from_bytes(bytes: &[u8]) -> Result<Fr, CryptoError> {
    Fr::deserialize_compressed(bytes)
        .map_err(|e| CryptoError::DeserializationError(format!("Invalid Fr scalar bytes: {}", e)))
}
