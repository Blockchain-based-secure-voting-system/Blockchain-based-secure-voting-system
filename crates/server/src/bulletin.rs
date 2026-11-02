use election_core::HexDisjunctiveRangeProof;
use sha2::{Digest, Sha256};

pub const GENESIS_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";

/// Compute the deterministic cryptographic entry hash for the append-only bulletin board:
/// entry_hash = SHA256(prev_hash || nullifier_hex || c1_hex || c2_hex || canonical_range_proof)
pub fn compute_entry_hash(
    prev_hash: &str,
    nullifier_hex: &str,
    c1_hex: &str,
    c2_hex: &str,
    range_proof: &HexDisjunctiveRangeProof,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"BULLETIN_ENTRY_V1:");
    hasher.update(prev_hash.as_bytes());
    hasher.update(b"|");
    hasher.update(nullifier_hex.as_bytes());
    hasher.update(b"|");
    hasher.update(c1_hex.as_bytes());
    hasher.update(b"|");
    hasher.update(c2_hex.as_bytes());
    hasher.update(b"|");
    // Canonical proof serialization
    hasher.update(range_proof.a0_hex.as_bytes());
    hasher.update(range_proof.b0_hex.as_bytes());
    hasher.update(range_proof.a1_hex.as_bytes());
    hasher.update(range_proof.b1_hex.as_bytes());
    hasher.update(range_proof.c0_hex.as_bytes());
    hasher.update(range_proof.c1_hex.as_bytes());
    hasher.update(range_proof.s0_hex.as_bytes());
    hasher.update(range_proof.s1_hex.as_bytes());

    hex::encode(hasher.finalize())
}
