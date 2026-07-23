use ark_bn254::{Fr, G1Projective};
use ark_ec::Group;
use ark_ff::UniformRand;
use ark_std::Zero;
use candid::CandidType;
use rand::{CryptoRng, RngCore};
use serde::{Deserialize, Serialize};

use crate::serde_utils::{g1_from_hex, g1_to_hex};
use crate::CryptoError;

/// ElGamal Public Key over BN254 G1
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PublicKey {
    pub point: G1Projective,
}

impl PublicKey {
    pub fn new(point: G1Projective) -> Self {
        Self { point }
    }

    pub fn to_hex(&self) -> String {
        g1_to_hex(&self.point)
    }

    pub fn from_hex(hex_str: &str) -> Result<Self, CryptoError> {
        let point = g1_from_hex(hex_str)?;
        Ok(Self { point })
    }
}

/// ElGamal Key Pair (Trustee Secret Key & Public Key)
#[derive(Clone, Debug)]
pub struct KeyPair {
    pub sk: Fr,
    pub pk: PublicKey,
}

impl KeyPair {
    pub fn generate<R: RngCore + CryptoRng>(rng: &mut R) -> Self {
        let sk = Fr::rand(rng);
        let generator = G1Projective::generator();
        let pk_point = generator * sk;
        Self {
            sk,
            pk: PublicKey::new(pk_point),
        }
    }

    pub fn from_sk(sk: Fr) -> Self {
        let generator = G1Projective::generator();
        let pk_point = generator * sk;
        Self {
            sk,
            pk: PublicKey::new(pk_point),
        }
    }
}

/// ElGamal Ciphertext (C1, C2) in G1 x G1
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Ciphertext {
    pub c1: G1Projective,
    pub c2: G1Projective,
}

impl Ciphertext {
    pub fn new(c1: G1Projective, c2: G1Projective) -> Self {
        Self { c1, c2 }
    }

    pub fn zero() -> Self {
        Self {
            c1: G1Projective::zero(),
            c2: G1Projective::zero(),
        }
    }

    pub fn homomorphic_add(&self, other: &Self) -> Self {
        Self {
            c1: self.c1 + other.c1,
            c2: self.c2 + other.c2,
        }
    }
}

/// Serialized representation of a Ciphertext for transport (Candid / JSON / Hex)
#[derive(CandidType, Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct HexCiphertext {
    pub c1_hex: String,
    pub c2_hex: String,
}

impl HexCiphertext {
    pub fn from_ciphertext(ct: &Ciphertext) -> Self {
        Self {
            c1_hex: g1_to_hex(&ct.c1),
            c2_hex: g1_to_hex(&ct.c2),
        }
    }

    pub fn to_ciphertext(&self) -> Result<Ciphertext, CryptoError> {
        let c1 = g1_from_hex(&self.c1_hex)?;
        let c2 = g1_from_hex(&self.c2_hex)?;
        Ok(Ciphertext { c1, c2 })
    }
}

/// Encrypt a vote scalar m using trustee public key PK with fresh randomness r:
/// C1 = r * G
/// C2 = r * PK + m * G
pub fn encrypt_with_randomness(pk: &PublicKey, vote_scalar: u64, r: &Fr) -> Ciphertext {
    let generator = G1Projective::generator();
    let m_scalar = Fr::from(vote_scalar);

    let c1 = generator * r;
    let c2 = (pk.point * r) + (generator * m_scalar);

    Ciphertext { c1, c2 }
}

/// Encrypt a vote scalar m generating cryptographically secure randomness r
pub fn encrypt<R: RngCore + CryptoRng>(
    pk: &PublicKey,
    vote_scalar: u64,
    rng: &mut R,
) -> (Ciphertext, Fr) {
    let r = Fr::rand(rng);
    let ciphertext = encrypt_with_randomness(pk, vote_scalar, &r);
    (ciphertext, r)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::thread_rng;

    #[test]
    fn test_elgamal_homomorphic_addition() {
        let mut rng = thread_rng();
        let keypair = KeyPair::generate(&mut rng);

        let vote1 = 1u64;
        let vote2 = 1u64;
        let vote3 = 0u64;

        let (c1, _) = encrypt(&keypair.pk, vote1, &mut rng);
        let (c2, _) = encrypt(&keypair.pk, vote2, &mut rng);
        let (c3, _) = encrypt(&keypair.pk, vote3, &mut rng);

        // Homomorphic sum
        let sum_ct = c1.homomorphic_add(&c2).homomorphic_add(&c3);

        // Decrypt expected sum: D = C2 - sk * C1
        let decrypted_point = sum_ct.c2 - (sum_ct.c1 * keypair.sk);

        // Expected total = 1 + 1 + 0 = 2
        let generator = G1Projective::generator();
        let expected_point = generator * Fr::from(2u64);

        assert_eq!(decrypted_point, expected_point);
    }
}
