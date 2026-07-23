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

/// Chaum-Pedersen Zero-Knowledge Proof of Decryption Equality
/// Proves DLEQ(G, PK, C1_sum, W) with secret key sk
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChaumPedersenProof {
    pub a: G1Projective, // k * G
    pub b: G1Projective, // k * C1_sum
    pub s: Fr,           // k + c * sk
    pub w: G1Projective, // sk * C1_sum (decryption factor)
    pub decrypted_tally: u64,
}

/// Serialized struct of proof for Candid / JSON RPC transport
#[derive(CandidType, Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct HexChaumPedersenProof {
    pub a_hex: String,
    pub b_hex: String,
    pub s_hex: String,
    pub w_hex: String,
    pub decrypted_tally: u64,
}

impl HexChaumPedersenProof {
    pub fn from_proof(proof: &ChaumPedersenProof) -> Self {
        Self {
            a_hex: g1_to_hex(&proof.a),
            b_hex: g1_to_hex(&proof.b),
            s_hex: fr_to_hex(&proof.s),
            w_hex: g1_to_hex(&proof.w),
            decrypted_tally: proof.decrypted_tally,
        }
    }

    pub fn to_proof(&self) -> Result<ChaumPedersenProof, CryptoError> {
        let a = g1_from_hex(&self.a_hex)?;
        let b = g1_from_hex(&self.b_hex)?;
        let s = fr_from_hex(&self.s_hex)?;
        let w = g1_from_hex(&self.w_hex)?;
        Ok(ChaumPedersenProof {
            a,
            b,
            s,
            w,
            decrypted_tally: self.decrypted_tally,
        })
    }
}

/// Compute Fiat-Shamir challenge scalar c = Keccak256(domain || G || PK || C1 || W || A || B)
pub fn compute_fiat_shamir_challenge(
    pk: &PublicKey,
    c1_sum: &G1Projective,
    w: &G1Projective,
    a: &G1Projective,
    b: &G1Projective,
) -> Fr {
    let generator = G1Projective::generator();
    let mut hasher = Keccak::v256();

    hasher.update(b"CHAUM_PEDERSEN_BN254_V1");
    hasher.update(&g1_to_bytes(&generator));
    hasher.update(&g1_to_bytes(&pk.point));
    hasher.update(&g1_to_bytes(c1_sum));
    hasher.update(&g1_to_bytes(w));
    hasher.update(&g1_to_bytes(a));
    hasher.update(&g1_to_bytes(b));

    let mut hash_bytes = [0u8; 32];
    hasher.finalize(&mut hash_bytes);

    Fr::from_be_bytes_mod_order(&hash_bytes)
}

/// Generate Chaum-Pedersen Zero-Knowledge Decryption Proof (Trustee Side)
pub fn generate_decryption_proof<R: RngCore + CryptoRng>(
    sk: &Fr,
    pk: &PublicKey,
    encrypted_sum: &Ciphertext,
    decrypted_tally: u64,
    rng: &mut R,
) -> ChaumPedersenProof {
    let generator = G1Projective::generator();
    let w = encrypted_sum.c1 * sk;

    let k = Fr::rand(rng);
    let a = generator * k;
    let b = encrypted_sum.c1 * k;

    let c = compute_fiat_shamir_challenge(pk, &encrypted_sum.c1, &w, &a, &b);
    let s = k + (c * sk);

    ChaumPedersenProof {
        a,
        b,
        s,
        w,
        decrypted_tally,
    }
}

/// Verify Chaum-Pedersen Zero-Knowledge Decryption Proof (Canister / Verifier Side)
pub fn verify_decryption_proof(
    pk: &PublicKey,
    encrypted_sum: &Ciphertext,
    proof: &ChaumPedersenProof,
) -> Result<(), CryptoError> {
    let generator = G1Projective::generator();

    // 1. Verify tally match: C2_sum - W == decrypted_tally * G
    let claimed_tally_point = generator * Fr::from(proof.decrypted_tally);
    let calculated_tally_point = encrypted_sum.c2 - proof.w;

    if claimed_tally_point != calculated_tally_point {
        return Err(CryptoError::TallyMismatch);
    }

    // 2. Recompute Fiat-Shamir challenge scalar c
    let c = compute_fiat_shamir_challenge(pk, &encrypted_sum.c1, &proof.w, &proof.a, &proof.b);

    // 3. Verify equation 1: s * G == A + c * PK
    let lhs1 = generator * proof.s;
    let rhs1 = proof.a + (pk.point * c);
    if lhs1 != rhs1 {
        return Err(CryptoError::InvalidProof);
    }

    // 4. Verify equation 2: s * C1_sum == B + c * W
    let lhs2 = encrypted_sum.c1 * proof.s;
    let rhs2 = proof.b + (proof.w * c);
    if lhs2 != rhs2 {
        return Err(CryptoError::InvalidProof);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bsgs::solve_discrete_log;
    use crate::elgamal::{encrypt, KeyPair};
    use rand::thread_rng;

    #[test]
    fn test_chaum_pedersen_proof_valid() {
        let mut rng = thread_rng();
        let keypair = KeyPair::generate(&mut rng);

        let (vote1, _) = encrypt(&keypair.pk, 1, &mut rng);
        let (vote2, _) = encrypt(&keypair.pk, 1, &mut rng);
        let (vote3, _) = encrypt(&keypair.pk, 0, &mut rng);

        let sum_ct = vote1.homomorphic_add(&vote2).homomorphic_add(&vote3);

        // Decrypt point W = sk * C1_sum
        let decrypted_point = sum_ct.c2 - (sum_ct.c1 * keypair.sk);
        let tally = solve_discrete_log(&decrypted_point, 100).unwrap();
        assert_eq!(tally, 2);

        // Generate ZK proof
        let proof = generate_decryption_proof(&keypair.sk, &keypair.pk, &sum_ct, tally, &mut rng);

        // Verify ZK proof
        assert!(verify_decryption_proof(&keypair.pk, &sum_ct, &proof).is_ok());
    }

    #[test]
    fn test_chaum_pedersen_proof_tampered_tally_fails() {
        let mut rng = thread_rng();
        let keypair = KeyPair::generate(&mut rng);

        let (vote1, _) = encrypt(&keypair.pk, 1, &mut rng);
        let proof = generate_decryption_proof(&keypair.sk, &keypair.pk, &vote1, 1, &mut rng);

        // Tamper with decrypted tally (claim 2 instead of 1)
        let mut tampered_proof = proof.clone();
        tampered_proof.decrypted_tally = 2;

        let res = verify_decryption_proof(&keypair.pk, &vote1, &tampered_proof);
        assert_eq!(res, Err(CryptoError::TallyMismatch));
    }

    #[test]
    fn test_chaum_pedersen_proof_tampered_response_fails() {
        let mut rng = thread_rng();
        let keypair = KeyPair::generate(&mut rng);

        let (vote1, _) = encrypt(&keypair.pk, 1, &mut rng);
        let mut proof = generate_decryption_proof(&keypair.sk, &keypair.pk, &vote1, 1, &mut rng);

        // Tamper response s
        proof.s += Fr::from(1u64);

        let res = verify_decryption_proof(&keypair.pk, &vote1, &proof);
        assert_eq!(res, Err(CryptoError::InvalidProof));
    }
}
