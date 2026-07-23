use ark_bn254::{Fr, G1Affine, G1Projective};
use ark_ec::{CurveGroup, Group};
use std::collections::HashMap;

use crate::serde_utils::g1_to_bytes;
use crate::CryptoError;

/// Solves discrete log M * G = D for scalar M in range [0, max_bound]
/// Uses Baby-Step Giant-Step algorithm (O(sqrt(N)) time and memory).
pub fn solve_discrete_log(target: &G1Projective, max_bound: u64) -> Result<u64, CryptoError> {
    let generator = G1Projective::generator();

    // Fast path: 0 * G == Identity point
    if target.is_zero() {
        return Ok(0);
    }

    // Fast linear search for tiny bounds (<= 100)
    if max_bound <= 100 {
        let mut curr = G1Projective::zero();
        for m in 0..=max_bound {
            if &curr == target {
                return Ok(m);
            }
            curr += generator;
        }
        return Err(CryptoError::DiscreteLogNotFound(max_bound));
    }

    // Baby-Step Giant-Step algorithm for larger bounds
    let m_step = (max_bound as f64).sqrt().ceil() as u64 + 1;

    // 1. Build Baby Steps table: j -> j * G for j in 0..m_step
    let mut baby_steps: HashMap<Vec<u8>, u64> = HashMap::with_capacity(m_step as usize);
    let mut baby_curr = G1Projective::zero();

    for j in 0..m_step {
        let key = g1_to_bytes(&baby_curr);
        baby_steps.insert(key, j);
        baby_curr += generator;
    }

    // 2. Giant Steps: compute step_point = m_step * G
    let step_point = generator * Fr::from(m_step);

    // Compute Target - i * step_point for i in 0..=m_step
    let mut giant_curr = *target;

    for i in 0..=m_step {
        let key = g1_to_bytes(&giant_curr);
        if let Some(&j) = baby_steps.get(&key) {
            let result = i * m_step + j;
            if result <= max_bound {
                return Ok(result);
            }
        }
        giant_curr -= step_point;
    }

    Err(CryptoError::DiscreteLogNotFound(max_bound))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bsgs_discrete_log() {
        let generator = G1Projective::generator();

        // Test 0
        let target0 = generator * Fr::from(0u64);
        assert_eq!(solve_discrete_log(&target0, 1000).unwrap(), 0);

        // Test 1
        let target1 = generator * Fr::from(1u64);
        assert_eq!(solve_discrete_log(&target1, 1000).unwrap(), 1);

        // Test 42
        let target42 = generator * Fr::from(42u64);
        assert_eq!(solve_discrete_log(&target42, 1000).unwrap(), 42);

        // Test larger value (e.g. 2500)
        let target2500 = generator * Fr::from(2500u64);
        assert_eq!(solve_discrete_log(&target2500, 10000).unwrap(), 2500);
    }
}
