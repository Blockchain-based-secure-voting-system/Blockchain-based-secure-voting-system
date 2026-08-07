use ark_bn254::{Fr, G1Projective};
use ark_ec::Group;
use ark_ff::{Field, PrimeField, UniformRand};
use candid::CandidType;
use rand::{CryptoRng, RngCore};
use serde::{Deserialize, Serialize};

use crate::elgamal::{Ciphertext, KeyPair, PublicKey};
use crate::serde_utils::{fr_from_hex, fr_to_hex};
use crate::CryptoError;

/// Individual secret key share held by trustee index `x_i`
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct KeyShare {
    pub index: u64,
    pub share: Fr,
}

/// Hex-serialized key share for transport / CLI storage
#[derive(CandidType, Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct HexKeyShare {
    pub index: u64,
    pub share_hex: String,
}

impl HexKeyShare {
    pub fn from_share(share: &KeyShare) -> Self {
        Self {
            index: share.index,
            share_hex: fr_to_hex(&share.share),
        }
    }

    pub fn to_share(&self) -> Result<KeyShare, CryptoError> {
        let share = fr_from_hex(&self.share_hex)?;
        Ok(KeyShare {
            index: self.index,
            share,
        })
    }
}

/// Result of Trusted Dealer Threshold Key Generation (n-of-m)
pub struct ThresholdKeyPair {
    pub master_keypair: KeyPair,
    pub threshold: u64,
    pub total_shares: u64,
    pub shares: Vec<KeyShare>,
}

/// Split an existing secret key `sk` into an n-of-m Shamir Secret Sharing threshold scheme
pub fn split_secret_key<R: RngCore + CryptoRng>(
    sk: &Fr,
    threshold: u64,
    total_shares: u64,
    rng: &mut R,
) -> Result<Vec<KeyShare>, CryptoError> {
    if threshold == 0 || threshold > total_shares {
        return Err(CryptoError::DeserializationError(
            "Threshold n must be between 1 and total_shares m".to_string(),
        ));
    }

    // Generate random polynomial coefficients: f(x) = sk + a_1*x + a_2*x^2 + ... + a_{n-1}*x^{n-1}
    let mut coeffs = Vec::with_capacity(threshold as usize);
    coeffs.push(*sk);

    for _ in 1..threshold {
        coeffs.push(Fr::rand(rng));
    }

    // Evaluate f(i) for i = 1..=m
    let mut shares = Vec::with_capacity(total_shares as usize);
    for i in 1..=total_shares {
        let x = Fr::from(i);
        let mut y = Fr::from(0u64);
        let mut x_pow = Fr::from(1u64);

        for coeff in &coeffs {
            y += *coeff * x_pow;
            x_pow *= x;
        }

        shares.push(KeyShare { index: i, share: y });
    }

    Ok(shares)
}

/// Trusted Dealer setup: Generate fresh master KeyPair and split secret key into n-of-m threshold shares
pub fn generate_threshold_keypair<R: RngCore + CryptoRng>(
    threshold: u64,
    total_shares: u64,
    rng: &mut R,
) -> Result<ThresholdKeyPair, CryptoError> {
    let master_keypair = KeyPair::generate(rng);
    let shares = split_secret_key(&master_keypair.sk, threshold, total_shares, rng)?;

    Ok(ThresholdKeyPair {
        master_keypair,
        threshold,
        total_shares,
        shares,
    })
}

/// Compute Lagrange Interpolation Coefficient \lambda_i(0) = \prod_{j \neq i} \frac{-x_j}{x_i - x_j} \pmod q
pub fn compute_lagrange_coefficient(shares: &[KeyShare], target_index: usize) -> Result<Fr, CryptoError> {
    let x_i = Fr::from(shares[target_index].index);
    let mut num = Fr::from(1u64);
    let mut den = Fr::from(1u64);

    for (j, share) in shares.iter().enumerate() {
        if j == target_index {
            continue;
        }
        let x_j = Fr::from(share.index);
        num *= -x_j;
        den *= x_i - x_j;
    }

    let den_inv = den
        .inverse()
        .ok_or_else(|| CryptoError::DeserializationError("Duplicate or invalid share index in Lagrange interpolation".to_string()))?;

    Ok(num * den_inv)
}

/// Reconstruct master secret key `sk` from any `n` valid Shamir shares using Lagrange interpolation
pub fn combine_shares(shares: &[KeyShare]) -> Result<Fr, CryptoError> {
    if shares.is_empty() {
        return Err(CryptoError::DeserializationError(
            "Cannot reconstruct secret key from empty shares list".to_string(),
        ));
    }

    let mut sk = Fr::from(0u64);
    for i in 0..shares.len() {
        let lambda_i = compute_lagrange_coefficient(shares, i)?;
        sk += shares[i].share * lambda_i;
    }

    Ok(sk)
}

/// Combine trustee partial decryptions W_i = sk_i * C1 to reconstruct full decryption factor W = sk * C1
pub fn combine_partial_decryptions(
    shares: &[KeyShare],
    c1_sum: &G1Projective,
) -> Result<G1Projective, CryptoError> {
    let mut w = G1Projective::generator() * Fr::from(0u64);

    for i in 0..shares.len() {
        let lambda_i = compute_lagrange_coefficient(shares, i)?;
        let partial_w = *c1_sum * shares[i].share;
        w += partial_w * lambda_i;
    }

    Ok(w)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bsgs::solve_discrete_log;
    use crate::elgamal::encrypt;
    use rand::thread_rng;

    #[test]
    fn test_shamir_threshold_reconstruction_3_of_5() {
        let mut rng = thread_rng();
        let threshold = 3;
        let total_shares = 5;

        let threshold_kp = generate_threshold_keypair(threshold, total_shares, &mut rng).unwrap();
        let master_sk = threshold_kp.master_keypair.sk;

        // Reconstruct with exact threshold (3 shares: 1, 3, 5)
        let selected_shares = vec![
            threshold_kp.shares[0].clone(),
            threshold_kp.shares[2].clone(),
            threshold_kp.shares[4].clone(),
        ];

        let reconstructed_sk = combine_shares(&selected_shares).unwrap();
        assert_eq!(master_sk, reconstructed_sk, "Reconstructed secret key must match master secret key");
    }

    #[test]
    fn test_shamir_threshold_reconstruction_different_subsets() {
        let mut rng = thread_rng();
        let threshold = 2;
        let total_shares = 4;

        let threshold_kp = generate_threshold_keypair(threshold, total_shares, &mut rng).unwrap();

        // Subset A: shares (1, 2)
        let subset_a = vec![threshold_kp.shares[0].clone(), threshold_kp.shares[1].clone()];
        // Subset B: shares (3, 4)
        let subset_b = vec![threshold_kp.shares[2].clone(), threshold_kp.shares[3].clone()];

        let sk_a = combine_shares(&subset_a).unwrap();
        let sk_b = combine_shares(&subset_b).unwrap();

        assert_eq!(sk_a, threshold_kp.master_keypair.sk);
        assert_eq!(sk_b, threshold_kp.master_keypair.sk);
    }

    #[test]
    fn test_threshold_partial_decryption_tally_roundtrip() {
        let mut rng = thread_rng();
        let threshold = 3;
        let total_shares = 5;

        let threshold_kp = generate_threshold_keypair(threshold, total_shares, &mut rng).unwrap();
        let pk = &threshold_kp.master_keypair.pk;

        // Encrypt votes: 1, 1, 0 -> Total expected tally = 2
        let (v1, _) = encrypt(pk, 1, &mut rng);
        let (v2, _) = encrypt(pk, 1, &mut rng);
        let (v3, _) = encrypt(pk, 0, &mut rng);

        let sum_ct = v1.homomorphic_add(&v2).homomorphic_add(&v3);

        // Select 3 out of 5 trustee shares (absent trustees 2 and 4)
        let active_shares = vec![
            threshold_kp.shares[0].clone(), // Trustee 1
            threshold_kp.shares[2].clone(), // Trustee 3
            threshold_kp.shares[4].clone(), // Trustee 5
        ];

        // Combine partial decryptions directly: W = sum(lambda_i * sk_i * C1)
        let combined_w = combine_partial_decryptions(&active_shares, &sum_ct.c1).unwrap();

        // Decrypt tally: D = C2 - W
        let decrypted_point = sum_ct.c2 - combined_w;
        let tally = solve_discrete_log(&decrypted_point, 100).unwrap();

        assert_eq!(tally, 2, "Threshold partial decryption must recover exact vote count");
    }
}
