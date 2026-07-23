use tiny_keccak::{Hasher, Keccak};

/// Computes a deterministic 32-byte nullifier for a voter in a specific election.
/// nullifier = Keccak256("VOTING_NULLIFIER_V1" || voter_secret || election_id)
pub fn compute_nullifier(voter_secret: &[u8], election_id: &str) -> [u8; 32] {
    let mut hasher = Keccak::v256();
    hasher.update(b"VOTING_NULLIFIER_V1");
    hasher.update(voter_secret);
    hasher.update(election_id.as_bytes());

    let mut output = [0u8; 32];
    hasher.finalize(&mut output);
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nullifier_deterministic() {
        let secret = b"my_secret_voter_identity_key";
        let election = "election_2026_us_president";

        let n1 = compute_nullifier(secret, election);
        let n2 = compute_nullifier(secret, election);
        assert_eq!(n1, n2);

        let n3 = compute_nullifier(secret, "different_election");
        assert_ne!(n1, n3);
    }
}
