use anyhow::{anyhow, bail, Context, Result};
use election_core::ElectionPhase;
use server::bulletin::{compute_entry_hash, GENESIS_HASH};
use server::models::*;
use std::collections::HashSet;
use voting_crypto::{
    verify_decryption_proof, verify_range_proof, Ciphertext, HexChaumPedersenProof,
    HexCiphertext, PublicKey,
};

#[derive(Debug, PartialEq, Eq)]
pub struct AuditReport {
    pub total_ballots: usize,
    pub hash_chain_valid: bool,
    pub range_proofs_valid: bool,
    pub homomorphic_tally_matches: bool,
    pub decryption_proof_valid: Option<bool>,
    pub final_tally: Option<u64>,
}

pub fn audit_bulletin_and_tally(
    election: &ElectionDetailsResponse,
    bulletin: &BulletinLogResponse,
    tally: &TallyCiphertextResponse,
    decryption_proof: Option<&HexChaumPedersenProof>,
) -> Result<AuditReport> {
    // 1. Parse Trustee Public Key
    let trustee_pk = PublicKey::from_hex(&election.trustee_pk_hex)
        .map_err(|e| anyhow!("Invalid trustee public key hex in election details: {}", e))?;

    let mut expected_prev_hash = GENESIS_HASH.to_string();
    let mut seen_nullifiers = HashSet::new();
    let mut computed_sum = Ciphertext::zero();

    // 2. Audit each bulletin board entry
    for entry in &bulletin.entries {
        // A. Verify Hash Chain Link
        if entry.prev_hash != expected_prev_hash {
            bail!(
                "Hash chain link broken at sequence {}: expected prev_hash {}, got {}",
                entry.sequence_number,
                expected_prev_hash,
                entry.prev_hash
            );
        }

        let recomputed_entry_hash = compute_entry_hash(
            &entry.prev_hash,
            &entry.nullifier_hex,
            &entry.ciphertext_c1_hex,
            &entry.ciphertext_c2_hex,
            &entry.range_proof,
        );

        if entry.entry_hash != recomputed_entry_hash {
            bail!(
                "Tampered entry hash at sequence {}: expected recomputed {}, got {}",
                entry.sequence_number,
                recomputed_entry_hash,
                entry.entry_hash
            );
        }

        expected_prev_hash = entry.entry_hash.clone();

        // B. Verify Nullifier Uniqueness
        if !seen_nullifiers.insert(entry.nullifier_hex.clone()) {
            bail!(
                "Duplicate nullifier detected on bulletin board: {}",
                entry.nullifier_hex
            );
        }

        // C. Verify 1-out-of-2 ZK Range Proof (Encodes strictly 0 or 1)
        let ct = HexCiphertext {
            c1_hex: entry.ciphertext_c1_hex.clone(),
            c2_hex: entry.ciphertext_c2_hex.clone(),
        }
        .to_ciphertext()
        .map_err(|e| anyhow!("Corrupt ciphertext curve point at sequence {}: {}", entry.sequence_number, e))?;

        let proof = entry.range_proof.to_proof()
            .map_err(|e| anyhow!("Corrupt range proof format at sequence {}: {}", entry.sequence_number, e))?;

        verify_range_proof(&trustee_pk, &ct, &proof)
            .map_err(|e| anyhow!("ZK range proof failed verification at sequence {}: {}", entry.sequence_number, e))?;

        // D. Homomorphic Addition
        computed_sum = computed_sum.homomorphic_add(&ct);
    }

    // 3. Verify Homomorphic Tally Ciphertext Match
    let hex_sum = HexCiphertext::from_ciphertext(&computed_sum);
    if hex_sum.c1_hex != tally.c1_hex || hex_sum.c2_hex != tally.c2_hex {
        bail!(
            "Homomorphic sum mismatch: Server announced ({}, {}), Verifier computed ({}, {})",
            tally.c1_hex,
            tally.c2_hex,
            hex_sum.c1_hex,
            hex_sum.c2_hex
        );
    }

    if tally.total_ballots != bulletin.entries.len() as u64 {
        bail!(
            "Total ballots count mismatch: Server announced {}, bulletin log contains {}",
            tally.total_ballots,
            bulletin.entries.len()
        );
    }

    // 4. Verify Chaum-Pedersen Decryption Proof if Election Complete
    let decryption_proof_valid = if election.phase == ElectionPhase::Complete {
        let proof_hex = decryption_proof
            .ok_or_else(|| anyhow!("Election is Complete but Chaum-Pedersen decryption proof was not supplied"))?;

        let proof = proof_hex.to_proof()
            .map_err(|e| anyhow!("Invalid Chaum-Pedersen decryption proof encoding: {}", e))?;

        verify_decryption_proof(&trustee_pk, &computed_sum, &proof)
            .context("Chaum-Pedersen zero-knowledge decryption proof failed verification")?;

        Some(true)
    } else {
        None
    };

    Ok(AuditReport {
        total_ballots: bulletin.entries.len(),
        hash_chain_valid: true,
        range_proofs_valid: true,
        homomorphic_tally_matches: true,
        decryption_proof_valid,
        final_tally: election.final_tally,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_bn254::Fr;
    use ark_ff::UniformRand;
    use voting_crypto::{
        compute_nullifier, generate_decryption_proof, encrypt_with_randomness, generate_range_proof,
        HexDisjunctiveRangeProof, KeyPair,
    };

    fn create_test_election_and_entries() -> (
        ElectionDetailsResponse,
        BulletinLogResponse,
        TallyCiphertextResponse,
        HexChaumPedersenProof,
    ) {
        let mut rng = rand::thread_rng();
        let keypair = KeyPair::generate(&mut rng);
        let trustee_pk_hex = keypair.pk.to_hex();

        let mut entries = Vec::new();
        let mut prev_hash = GENESIS_HASH.to_string();
        let mut sum = Ciphertext::zero();

        // 3 ballots: votes [1, 0, 1] -> sum = 2
        let votes = [1u64, 0u64, 1u64];
        for (i, &vote) in votes.iter().enumerate() {
            let r = Fr::rand(&mut rng);
            let ct = encrypt_with_randomness(&keypair.pk, vote, &r);
            sum = sum.homomorphic_add(&ct);

            let proof = generate_range_proof(&keypair.pk, &ct, vote, &r, &mut rng).unwrap();
            let hex_proof = HexDisjunctiveRangeProof::from_proof(&proof);
            let hex_ct = HexCiphertext::from_ciphertext(&ct);
            let nullifier_hex = hex::encode(compute_nullifier(format!("secret_{}", i).as_bytes(), "test_election"));

            let entry_hash = compute_entry_hash(
                &prev_hash,
                &nullifier_hex,
                &hex_ct.c1_hex,
                &hex_ct.c2_hex,
                &hex_proof,
            );

            entries.push(BulletinEntry {
                sequence_number: (i + 1) as i64,
                prev_hash: prev_hash.clone(),
                entry_hash: entry_hash.clone(),
                nullifier_hex,
                ciphertext_c1_hex: hex_ct.c1_hex,
                ciphertext_c2_hex: hex_ct.c2_hex,
                range_proof: hex_proof,
            });

            prev_hash = entry_hash;
        }

        let hex_sum = HexCiphertext::from_ciphertext(&sum);
        let tally = TallyCiphertextResponse {
            c1_hex: hex_sum.c1_hex,
            c2_hex: hex_sum.c2_hex,
            total_ballots: 3,
        };

        let dec_proof = generate_decryption_proof(&keypair.sk, &keypair.pk, &sum, 2, &mut rng);
        let hex_dec_proof = HexChaumPedersenProof::from_proof(&dec_proof);

        let election = ElectionDetailsResponse {
            id: "test".to_string(),
            title: "Test Election".to_string(),
            trustee_pk_hex,
            phase: ElectionPhase::Complete,
            start_time: None,
            end_time: None,
            roll_commitment_hex: None,
            credentials_issued_count: 3,
            credentials_used_count: 3,
            ballots_in_log_count: 3,
            chain_head_hash: prev_hash.clone(),
            final_tally: Some(2),
            proof_verified: true,
        };

        let bulletin = BulletinLogResponse {
            entries,
            total_count: 3,
            chain_head_hash: prev_hash,
        };

        (election, bulletin, tally, hex_dec_proof)
    }

    #[test]
    fn test_audit_report_valid() {
        let (election, bulletin, tally, proof) = create_test_election_and_entries();
        let report = audit_bulletin_and_tally(&election, &bulletin, &tally, Some(&proof)).unwrap();
        assert_eq!(report.total_ballots, 3);
        assert!(report.hash_chain_valid);
        assert!(report.range_proofs_valid);
        assert!(report.homomorphic_tally_matches);
        assert_eq!(report.decryption_proof_valid, Some(true));
        assert_eq!(report.final_tally, Some(2));
    }

    #[test]
    fn test_audit_detects_tampered_hash_chain() {
        let (election, mut bulletin, tally, proof) = create_test_election_and_entries();
        // Tamper with the prev_hash of the second entry
        bulletin.entries[1].prev_hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string();

        let err = audit_bulletin_and_tally(&election, &bulletin, &tally, Some(&proof)).unwrap_err();
        assert!(err.to_string().contains("Hash chain link broken"));
    }

    #[test]
    fn test_audit_detects_tampered_entry_hash() {
        let (election, mut bulletin, tally, proof) = create_test_election_and_entries();
        // Tamper with the entry_hash of the first entry
        bulletin.entries[0].entry_hash = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff".to_string();

        let err = audit_bulletin_and_tally(&election, &bulletin, &tally, Some(&proof)).unwrap_err();
        assert!(err.to_string().contains("Tampered entry hash"));
    }

    #[test]
    fn test_audit_detects_duplicate_nullifier() {
        let (election, mut bulletin, tally, proof) = create_test_election_and_entries();
        // Set second entry's nullifier to match the first entry
        bulletin.entries[1].nullifier_hex = bulletin.entries[0].nullifier_hex.clone();
        // Recompute hash so hash chain check alone doesn't trigger first
        bulletin.entries[1].entry_hash = compute_entry_hash(
            &bulletin.entries[1].prev_hash,
            &bulletin.entries[1].nullifier_hex,
            &bulletin.entries[1].ciphertext_c1_hex,
            &bulletin.entries[1].ciphertext_c2_hex,
            &bulletin.entries[1].range_proof,
        );

        let err = audit_bulletin_and_tally(&election, &bulletin, &tally, Some(&proof)).unwrap_err();
        assert!(err.to_string().contains("Duplicate nullifier detected"));
    }

    #[test]
    fn test_audit_detects_tampered_range_proof() {
        let (election, mut bulletin, tally, proof) = create_test_election_and_entries();
        // Tamper with response scalar s0 of the first entry's range proof
        bulletin.entries[0].range_proof.s0_hex = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef".to_string();
        // Recompute hash
        bulletin.entries[0].entry_hash = compute_entry_hash(
            &bulletin.entries[0].prev_hash,
            &bulletin.entries[0].nullifier_hex,
            &bulletin.entries[0].ciphertext_c1_hex,
            &bulletin.entries[0].ciphertext_c2_hex,
            &bulletin.entries[0].range_proof,
        );
        bulletin.entries[1].prev_hash = bulletin.entries[0].entry_hash.clone();

        let err = audit_bulletin_and_tally(&election, &bulletin, &tally, Some(&proof)).unwrap_err();
        let err_str = err.to_string();
        assert!(
            err_str.contains("range proof") || err_str.contains("Range proof"),
            "Expected range proof failure, got: {}",
            err_str
        );
    }

    #[test]
    fn test_audit_detects_tally_mismatch() {
        let (election, bulletin, mut tally, proof) = create_test_election_and_entries();
        // Tamper with server tally ciphertext
        tally.c1_hex = "0000000000000000000000000000000000000000000000000000000000000000".to_string();

        let err = audit_bulletin_and_tally(&election, &bulletin, &tally, Some(&proof)).unwrap_err();
        assert!(err.to_string().contains("Homomorphic sum mismatch"));
    }
}
