use ark_bn254::{Fr, G1Projective};
use ark_ec::Group;
use ark_ff::{PrimeField, UniformRand};
use candid::CandidType;
use rand::{CryptoRng, RngCore};
use serde::{Deserialize, Serialize};
use tiny_keccak::{Hasher, Keccak};

use crate::elgamal::{Ciphertext, PublicKey};
use crate::serde_utils::{
    fr_from_hex, fr_to_hex, g1_from_hex, g1_to_bytes, g1_to_hex,
};
use crate::CryptoError;

/// 1-out-of-2 Disjunctive Range Proof structure
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DisjunctiveRangeProof {
    pub a0: G1Projective,
    pub b0: G1Projective,
    pub a1: G1Projective,
    pub b1: G1Projective,
    pub c0: Fr,
    pub c1: Fr,
    pub s0: Fr,
    pub s1: Fr,
}

/// Hex-serialized representation of Disjunctive Range Proof for transport (Candid / JSON RPC)
#[derive(CandidType, Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct HexDisjunctiveRangeProof {
    pub a0_hex: String,
    pub b0_hex: String,
    pub a1_hex: String,
    pub b1_hex: String,
    pub c0_hex: String,
    pub c1_hex: String,
    pub s0_hex: String,
    pub s1_hex: String,
}

impl HexDisjunctiveRangeProof {
    pub fn from_proof(proof: &DisjunctiveRangeProof) -> Self {
        Self {
            a0_hex: g1_to_hex(&proof.a0),
            b0_hex: g1_to_hex(&proof.b0),
            a1_hex: g1_to_hex(&proof.a1),
            b1_hex: g1_to_hex(&proof.b1),
            c0_hex: fr_to_hex(&proof.c0),
            c1_hex: fr_to_hex(&proof.c1),
            s0_hex: fr_to_hex(&proof.s0),
            s1_hex: fr_to_hex(&proof.s1),
        }
    }

    pub fn to_proof(&self) -> Result<DisjunctiveRangeProof, CryptoError> {
        Ok(DisjunctiveRangeProof {
            a0: g1_from_hex(&self.a0_hex)?,
            b0: g1_from_hex(&self.b0_hex)?,
            a1: g1_from_hex(&self.a1_hex)?,
            b1: g1_from_hex(&self.b1_hex)?,
            c0: fr_from_hex(&self.c0_hex)?,
            c1: fr_from_hex(&self.c1_hex)?,
            s0: fr_from_hex(&self.s0_hex)?,
            s1: fr_from_hex(&self.s1_hex)?,
        })
    }
}

/// Compute Fiat-Shamir hash challenge c for disjunctive proof
pub fn compute_disjunctive_challenge(
    pk: &PublicKey,
    ct: &Ciphertext,
    a0: &G1Projective,
    b0: &G1Projective,
    a1: &G1Projective,
    b1: &G1Projective,
) -> Fr {
    let generator = G1Projective::generator();
    let mut hasher = Keccak::v256();

    hasher.update(b"DISJUNCTIVE_RANGE_PROOF_BN254_V1");
    hasher.update(&g1_to_bytes(&generator));
    hasher.update(&g1_to_bytes(&pk.point));
    hasher.update(&g1_to_bytes(&ct.c1));
    hasher.update(&g1_to_bytes(&ct.c2));
    hasher.update(&g1_to_bytes(a0));
    hasher.update(&g1_to_bytes(b0));
    hasher.update(&g1_to_bytes(a1));
    hasher.update(&g1_to_bytes(b1));

    let mut hash_bytes = [0u8; 32];
    hasher.finalize(&mut hash_bytes);

    Fr::from_be_bytes_mod_order(&hash_bytes)
}

/// Generate 1-out-of-2 Disjunctive Range Proof (Client Prover Side)
pub fn generate_range_proof<R: RngCore + CryptoRng>(
    pk: &PublicKey,
    ct: &Ciphertext,
    vote: u64,
    r: &Fr,
    rng: &mut R,
) -> Result<DisjunctiveRangeProof, CryptoError> {
    if vote != 0 && vote != 1 {
        return Err(CryptoError::DeserializationError(
            "Range proof can only be generated for vote 0 or 1".to_string(),
        ));
    }

    let generator = G1Projective::generator();
    let w = Fr::rand(rng);

    if vote == 0 {
        // Real Branch: 0, Simulated Branch: 1
        let a0 = generator * w;
        let b0 = pk.point * w;

        let c1 = Fr::rand(rng);
        let s1 = Fr::rand(rng);

        // Simulate Branch 1:
        // a1 = s1 * G - c1 * C1
        // b1 = s1 * PK - c1 * (C2 - G)
        let c2_minus_g = ct.c2 - generator;
        let a1 = (generator * s1) - (ct.c1 * c1);
        let b1 = (pk.point * s1) - (c2_minus_g * c1);

        // Joint Challenge c
        let c_total = compute_disjunctive_challenge(pk, ct, &a0, &b0, &a1, &b1);
        let c0 = c_total - c1;
        let s0 = w + (c0 * r);

        Ok(DisjunctiveRangeProof {
            a0,
            b0,
            a1,
            b1,
            c0,
            c1,
            s0,
            s1,
        })
    } else {
        // Real Branch: 1, Simulated Branch: 0
        let a1 = generator * w;
        let b1 = pk.point * w;

        let c0 = Fr::rand(rng);
        let s0 = Fr::rand(rng);

        // Simulate Branch 0:
        // a0 = s0 * G - c0 * C1
        // b0 = s0 * PK - c0 * C2
        let a0 = (generator * s0) - (ct.c1 * c0);
        let b0 = (pk.point * s0) - (ct.c2 * c0);

        // Joint Challenge c
        let c_total = compute_disjunctive_challenge(pk, ct, &a0, &b0, &a1, &b1);
        let c1 = c_total - c0;
        let s1 = w + (c1 * r);

        Ok(DisjunctiveRangeProof {
            a0,
            b0,
            a1,
            b1,
            c0,
            c1,
            s0,
            s1,
        })
    }
}

/// Verify 1-out-of-2 Disjunctive Range Proof (Canister Verifier Side)
pub fn verify_range_proof(
    pk: &PublicKey,
    ct: &Ciphertext,
    proof: &DisjunctiveRangeProof,
) -> Result<(), CryptoError> {
    let generator = G1Projective::generator();

    // 1. Recompute joint challenge c and check c0 + c1 == c
    let c_expected = compute_disjunctive_challenge(
        pk, ct, &proof.a0, &proof.b0, &proof.a1, &proof.b1,
    );
    if proof.c0 + proof.c1 != c_expected {
        return Err(CryptoError::InvalidProof);
    }

    // 2. Verify Branch 0:
    // s0 * G == a0 + c0 * C1
    // s0 * PK == b0 + c0 * C2
    if generator * proof.s0 != proof.a0 + (ct.c1 * proof.c0) {
        return Err(CryptoError::InvalidProof);
    }
    if pk.point * proof.s0 != proof.b0 + (ct.c2 * proof.c0) {
        return Err(CryptoError::InvalidProof);
    }

    // 3. Verify Branch 1:
    // s1 * G == a1 + c1 * C1
    // s1 * PK == b1 + c1 * (C2 - G)
    let c2_minus_g = ct.c2 - generator;
    if generator * proof.s1 != proof.a1 + (ct.c1 * proof.c1) {
        return Err(CryptoError::InvalidProof);
    }
    if pk.point * proof.s1 != proof.b1 + (c2_minus_g * proof.c1) {
        return Err(CryptoError::InvalidProof);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::elgamal::{encrypt, KeyPair};
    use rand::thread_rng;

    #[test]
    fn test_valid_vote_0_range_proof() {
        let mut rng = thread_rng();
        let keypair = KeyPair::generate(&mut rng);
        let (ct, r) = encrypt(&keypair.pk, 0, &mut rng);

        let proof = generate_range_proof(&keypair.pk, &ct, 0, &r, &mut rng).unwrap();
        assert!(verify_range_proof(&keypair.pk, &ct, &proof).is_ok());
    }

    #[test]
    fn test_valid_vote_1_range_proof() {
        let mut rng = thread_rng();
        let keypair = KeyPair::generate(&mut rng);
        let (ct, r) = encrypt(&keypair.pk, 1, &mut rng);

        let proof = generate_range_proof(&keypair.pk, &ct, 1, &r, &mut rng).unwrap();
        assert!(verify_range_proof(&keypair.pk, &ct, &proof).is_ok());
    }

    #[test]
    fn test_invalid_vote_2_fails_proof_gen() {
        let mut rng = thread_rng();
        let keypair = KeyPair::generate(&mut rng);
        let (ct, r) = encrypt(&keypair.pk, 2, &mut rng);

        let res = generate_range_proof(&keypair.pk, &ct, 2, &r, &mut rng);
        assert!(res.is_err());
    }

    #[test]
    fn test_tampered_range_proof_fails_verification() {
        let mut rng = thread_rng();
        let keypair = KeyPair::generate(&mut rng);
        let (ct, r) = encrypt(&keypair.pk, 0, &mut rng);

        let mut proof = generate_range_proof(&keypair.pk, &ct, 0, &r, &mut rng).unwrap();
        proof.s0 += Fr::from(1u64); // Tamper response

        assert_eq!(
            verify_range_proof(&keypair.pk, &ct, &proof),
            Err(CryptoError::InvalidProof)
        );
    }

    #[test]
    fn test_range_proof_invalid_challenge_sum_fails() {
        let mut rng = thread_rng();
        let keypair = KeyPair::generate(&mut rng);
        let (ct, r) = encrypt(&keypair.pk, 1, &mut rng);

        let mut proof = generate_range_proof(&keypair.pk, &ct, 1, &r, &mut rng).unwrap();
        proof.c0 += Fr::from(1u64); // Break c0 + c1 == c

        assert_eq!(
            verify_range_proof(&keypair.pk, &ct, &proof),
            Err(CryptoError::InvalidProof)
        );
    }

    #[test]
    fn test_range_proof_wrong_pk_fails() {
        let mut rng = thread_rng();
        let keypair1 = KeyPair::generate(&mut rng);
        let keypair2 = KeyPair::generate(&mut rng);
        let (ct, r) = encrypt(&keypair1.pk, 1, &mut rng);

        let proof = generate_range_proof(&keypair1.pk, &ct, 1, &r, &mut rng).unwrap();

        assert_eq!(
            verify_range_proof(&keypair2.pk, &ct, &proof),
            Err(CryptoError::InvalidProof)
        );
    }
}
