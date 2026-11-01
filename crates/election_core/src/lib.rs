//! # Election Core
//!
//! Pure, deterministic, zero-I/O state machine, server-enforced time-window checks,
//! and cryptographic ballot mathematical validation for the electronic voting system.
//!
//! This crate contains no network, database, or environment side-effects and can be
//! compiled and tested natively under standard Rust targets without canister or replica tooling.

use serde::{Deserialize, Serialize};
use thiserror::Error;

// Re-export cryptographic primitives and validation helpers from voting_crypto
pub use voting_crypto::{
    verify_decryption_proof, verify_range_proof, ChaumPedersenProof, Ciphertext,
    DisjunctiveRangeProof, HexChaumPedersenProof, HexCiphertext, HexDisjunctiveRangeProof,
    PublicKey,
};

/// Lifecycle phases of an election.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ElectionPhase {
    /// Initial phase: administrator configures title, trustee public key, time bounds,
    /// and publishes the roll commitment of eligible voter credential hashes.
    Setup,
    /// Voting phase: eligible voters submit encrypted ballots containing 1-out-of-2 ZK range proofs.
    Voting,
    /// Tallying phase: voting has closed; trustees combine key shares to compute and prove the tally.
    Tallying,
    /// Final phase: the zero-knowledge decryption proof has been verified and the final result is immutable.
    Complete,
}

impl std::fmt::Display for ElectionPhase {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Setup => write!(f, "Setup"),
            Self::Voting => write!(f, "Voting"),
            Self::Tallying => write!(f, "Tallying"),
            Self::Complete => write!(f, "Complete"),
        }
    }
}

/// Errors originating from core election state machine transitions, timing checks, or mathematical validations.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum ElectionCoreError {
    #[error("Action not permitted in current phase: expected {expected}, but election is in {actual}")]
    InvalidPhaseTransition {
        expected: ElectionPhase,
        actual: ElectionPhase,
    },

    #[error("Election title cannot be empty or shorter than 3 characters")]
    InvalidTitle,

    #[error("Invalid trustee public key: {0}")]
    InvalidTrusteePublicKey(String),

    #[error("Invalid time window: start_time ({start}) must be strictly earlier than end_time ({end})")]
    InvalidTimeWindow { start: u64, end: u64 },

    #[error("Cannot open voting: the configured deadline ({end_time}) has already elapsed at server time ({current_time})")]
    DeadlineAlreadyElapsed { end_time: u64, current_time: u64 },

    #[error("Cannot open voting: authoritative voter roll commitment must be published prior to opening voting")]
    MissingRollCommitment,

    #[error("Voting window has not opened yet: start time is {start_time}, server time is {current_time}")]
    VotingNotStarted {
        start_time: u64,
        current_time: u64,
    },

    #[error("Voting deadline has passed: voting closed at {end_time}, server time is {current_time}")]
    VotingDeadlinePassed { end_time: u64, current_time: u64 },

    #[error("Nullifier must be exactly 32 bytes, received {actual} bytes")]
    InvalidNullifierLength { actual: usize },

    #[error("Invalid ciphertext curve points on BN254 G1: {0}")]
    InvalidCiphertext(String),

    #[error("Invalid range proof format: {0}")]
    InvalidRangeProofFormat(String),

    #[error("ZK range proof verification failed (ballot does not encode valid 0 or 1): {0}")]
    RangeProofFailed(String),

    #[error("Cannot finalize election: Chaum-Pedersen decryption proof must be verified on-chain")]
    UnverifiedDecryptionProof,
}

/// Payload of a cast ballot containing a nullifier, an exponential ElGamal ciphertext,
/// and a 1-out-of-2 disjunctive Chaum-Pedersen zero-knowledge range proof.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BallotPayload {
    /// 32-byte deterministic nullifier: Keccak256("VOTING_NULLIFIER_V1" || secret || election_id)
    pub nullifier: Vec<u8>,
    /// Exponential ElGamal ciphertext (C1, C2) in hex
    pub ciphertext: HexCiphertext,
    /// 1-out-of-2 Disjunctive Chaum-Pedersen ZK Range Proof verifying m in {0, 1}
    pub range_proof: HexDisjunctiveRangeProof,
}

/// Pure in-memory election state model with deterministic transition rules.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ElectionState {
    pub title: String,
    pub trustee_pk_hex: String,
    pub phase: ElectionPhase,
    pub start_time: Option<u64>,
    pub end_time: Option<u64>,
    pub roll_commitment_hex: Option<String>,
    pub credentials_issued_count: u64,
    pub credentials_used_count: u64,
    pub ballots_cast_count: u64,
    pub final_tally: Option<u64>,
    pub proof_verified: bool,
}

impl ElectionState {
    /// Initialize a new election in the Setup phase with validation.
    pub fn new(
        title: impl Into<String>,
        trustee_pk_hex: impl Into<String>,
        start_time: Option<u64>,
        end_time: Option<u64>,
    ) -> Result<Self, ElectionCoreError> {
        let title = title.into();
        let trimmed_title = title.trim();
        if trimmed_title.len() < 3 {
            return Err(ElectionCoreError::InvalidTitle);
        }

        let trustee_pk_hex = trustee_pk_hex.into();
        let trimmed_pk = trustee_pk_hex.trim();
        // Validate trustee public key format against BN254 G1 curve
        PublicKey::from_hex(trimmed_pk)
            .map_err(|e| ElectionCoreError::InvalidTrusteePublicKey(e.to_string()))?;

        if let (Some(start), Some(end)) = (start_time, end_time) {
            if start >= end && (start > 0 || end > 0) {
                return Err(ElectionCoreError::InvalidTimeWindow { start, end });
            }
        }

        Ok(Self {
            title: trimmed_title.to_string(),
            trustee_pk_hex: trimmed_pk.to_string(),
            phase: ElectionPhase::Setup,
            start_time,
            end_time,
            roll_commitment_hex: None,
            credentials_issued_count: 0,
            credentials_used_count: 0,
            ballots_cast_count: 0,
            final_tally: None,
            proof_verified: false,
        })
    }

    /// Record the authoritative commitment hash of the sorted credential roll during Setup.
    pub fn set_roll_commitment(
        &mut self,
        commitment_hex: impl Into<String>,
        issued_count: u64,
    ) -> Result<(), ElectionCoreError> {
        if self.phase != ElectionPhase::Setup {
            return Err(ElectionCoreError::InvalidPhaseTransition {
                expected: ElectionPhase::Setup,
                actual: self.phase,
            });
        }
        self.roll_commitment_hex = Some(commitment_hex.into().trim().to_string());
        self.credentials_issued_count = issued_count;
        Ok(())
    }

    /// Transition from Setup to Voting phase using the verified current server time.
    pub fn open_voting(&mut self, current_server_time: u64) -> Result<(), ElectionCoreError> {
        if self.phase != ElectionPhase::Setup {
            return Err(ElectionCoreError::InvalidPhaseTransition {
                expected: ElectionPhase::Setup,
                actual: self.phase,
            });
        }

        if self.roll_commitment_hex.is_none() {
            return Err(ElectionCoreError::MissingRollCommitment);
        }

        if let Some(end) = self.end_time {
            if end > 0 && current_server_time >= end {
                return Err(ElectionCoreError::DeadlineAlreadyElapsed {
                    end_time: end,
                    current_time: current_server_time,
                });
            }
        }

        self.phase = ElectionPhase::Voting;
        Ok(())
    }

    /// Validate server-side timing rules for an incoming ballot submission.
    /// Strictly relies on server time; client-supplied timestamps are rejected.
    pub fn validate_ballot_timing(&self, current_server_time: u64) -> Result<(), ElectionCoreError> {
        if self.phase != ElectionPhase::Voting {
            return Err(ElectionCoreError::InvalidPhaseTransition {
                expected: ElectionPhase::Voting,
                actual: self.phase,
            });
        }

        if let Some(start) = self.start_time {
            if start > 0 && current_server_time < start {
                return Err(ElectionCoreError::VotingNotStarted {
                    start_time: start,
                    current_time: current_server_time,
                });
            }
        }

        if let Some(end) = self.end_time {
            if end > 0 && current_server_time > end {
                return Err(ElectionCoreError::VotingDeadlinePassed {
                    end_time: end,
                    current_time: current_server_time,
                });
            }
        }

        Ok(())
    }

    /// Mathematically validate an incoming ballot against the trustee public key.
    /// Checks:
    /// 1. Nullifier length is exactly 32 bytes.
    /// 2. Ciphertext curve points are valid BN254 G1 elements.
    /// 3. 1-out-of-2 Disjunctive Chaum-Pedersen range proof deserializes and verifies mathematically (m in {0, 1}).
    pub fn validate_ballot_math(
        &self,
        ballot: &BallotPayload,
    ) -> Result<(Ciphertext, DisjunctiveRangeProof), ElectionCoreError> {
        if ballot.nullifier.len() != 32 {
            return Err(ElectionCoreError::InvalidNullifierLength {
                actual: ballot.nullifier.len(),
            });
        }

        let trustee_pk = PublicKey::from_hex(&self.trustee_pk_hex)
            .map_err(|e| ElectionCoreError::InvalidTrusteePublicKey(e.to_string()))?;

        let ct = ballot
            .ciphertext
            .to_ciphertext()
            .map_err(|e| ElectionCoreError::InvalidCiphertext(e.to_string()))?;

        let range_proof = ballot
            .range_proof
            .to_proof()
            .map_err(|e| ElectionCoreError::InvalidRangeProofFormat(e.to_string()))?;

        verify_range_proof(&trustee_pk, &ct, &range_proof)
            .map_err(|e| ElectionCoreError::RangeProofFailed(e.to_string()))?;

        Ok((ct, range_proof))
    }

    /// Transition from Voting to Tallying phase.
    pub fn close_voting(&mut self) -> Result<(), ElectionCoreError> {
        if self.phase != ElectionPhase::Voting {
            return Err(ElectionCoreError::InvalidPhaseTransition {
                expected: ElectionPhase::Voting,
                actual: self.phase,
            });
        }
        self.phase = ElectionPhase::Tallying;
        Ok(())
    }

    /// Transition from Tallying to Complete phase once the decryption proof is verified.
    pub fn finalize_tally(
        &mut self,
        final_tally: u64,
        proof_verified: bool,
    ) -> Result<(), ElectionCoreError> {
        if self.phase != ElectionPhase::Tallying {
            return Err(ElectionCoreError::InvalidPhaseTransition {
                expected: ElectionPhase::Tallying,
                actual: self.phase,
            });
        }

        if !proof_verified {
            return Err(ElectionCoreError::UnverifiedDecryptionProof);
        }

        self.final_tally = Some(final_tally);
        self.proof_verified = true;
        self.phase = ElectionPhase::Complete;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_bn254::Fr;
    use ark_ff::UniformRand;
    use rand::rngs::OsRng;
    use voting_crypto::{
        compute_nullifier, encrypt_with_randomness, generate_range_proof, KeyPair,
    };

    const VALID_TEST_PK: &str =
        "106e65877afc24c61155ef68a7b4ba6f28112169993498eb19d367bcba0c9d20";

    #[test]
    fn test_valid_election_lifecycle_transitions() {
        let mut election = ElectionState::new(
            "2026 Municipal Civic Referendum",
            VALID_TEST_PK,
            Some(1000),
            Some(2000),
        )
        .expect("Valid initialization");

        assert_eq!(election.phase, ElectionPhase::Setup);

        // Record roll commitment
        election
            .set_roll_commitment("a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90", 100)
            .expect("Commitment in Setup succeeds");

        // Transition: Setup -> Voting
        election.open_voting(1500).expect("Open voting succeeds");
        assert_eq!(election.phase, ElectionPhase::Voting);

        // Timing validation
        election.validate_ballot_timing(1500).expect("Timing check within window passes");

        // Transition: Voting -> Tallying
        election.close_voting().expect("Close voting succeeds");
        assert_eq!(election.phase, ElectionPhase::Tallying);

        // Transition: Tallying -> Complete
        election
            .finalize_tally(42, true)
            .expect("Finalize tally with verified proof succeeds");
        assert_eq!(election.phase, ElectionPhase::Complete);
        assert_eq!(election.final_tally, Some(42));
        assert!(election.proof_verified);
    }

    #[test]
    fn test_out_of_order_and_illegal_phase_transitions() {
        let mut election = ElectionState::new("Test Election", VALID_TEST_PK, None, None).unwrap();
        election.set_roll_commitment("commit_hex", 10).unwrap();

        // Setup cannot jump to Tallying or Complete
        assert!(matches!(
            election.close_voting(),
            Err(ElectionCoreError::InvalidPhaseTransition {
                expected: ElectionPhase::Voting,
                actual: ElectionPhase::Setup
            })
        ));
        assert!(matches!(
            election.finalize_tally(10, true),
            Err(ElectionCoreError::InvalidPhaseTransition {
                expected: ElectionPhase::Tallying,
                actual: ElectionPhase::Setup
            })
        ));

        // Open voting
        election.open_voting(100).unwrap();
        assert_eq!(election.phase, ElectionPhase::Voting);

        // Voting cannot re-open or jump to Complete or modify roll
        assert!(matches!(
            election.open_voting(110),
            Err(ElectionCoreError::InvalidPhaseTransition {
                expected: ElectionPhase::Setup,
                actual: ElectionPhase::Voting
            })
        ));
        assert!(matches!(
            election.set_roll_commitment("new_commit", 20),
            Err(ElectionCoreError::InvalidPhaseTransition {
                expected: ElectionPhase::Setup,
                actual: ElectionPhase::Voting
            })
        ));
        assert!(matches!(
            election.finalize_tally(10, true),
            Err(ElectionCoreError::InvalidPhaseTransition {
                expected: ElectionPhase::Tallying,
                actual: ElectionPhase::Voting
            })
        ));

        // Close voting
        election.close_voting().unwrap();
        assert_eq!(election.phase, ElectionPhase::Tallying);

        // Tallying cannot re-open voting or close voting again
        assert!(matches!(
            election.open_voting(120),
            Err(ElectionCoreError::InvalidPhaseTransition {
                expected: ElectionPhase::Setup,
                actual: ElectionPhase::Tallying
            })
        ));
        assert!(matches!(
            election.close_voting(),
            Err(ElectionCoreError::InvalidPhaseTransition {
                expected: ElectionPhase::Voting,
                actual: ElectionPhase::Tallying
            })
        ));

        // Finalize
        election.finalize_tally(5, true).unwrap();
        assert_eq!(election.phase, ElectionPhase::Complete);

        // Complete is terminal; rejects any transition
        assert!(matches!(
            election.open_voting(130),
            Err(ElectionCoreError::InvalidPhaseTransition { .. })
        ));
        assert!(matches!(
            election.close_voting(),
            Err(ElectionCoreError::InvalidPhaseTransition { .. })
        ));
        assert!(matches!(
            election.finalize_tally(5, true),
            Err(ElectionCoreError::InvalidPhaseTransition { .. })
        ));
    }

    #[test]
    fn test_timing_rejections_enforced_by_server_clock() {
        let mut election = ElectionState::new(
            "Timed Election",
            VALID_TEST_PK,
            Some(1000),
            Some(2000),
        )
        .unwrap();

        // Cannot open voting if deadline already elapsed
        election.set_roll_commitment("roll_hash", 5).unwrap();
        let err = election.open_voting(2500).unwrap_err();
        assert_eq!(
            err,
            ElectionCoreError::DeadlineAlreadyElapsed {
                end_time: 2000,
                current_time: 2500
            }
        );

        // Open successfully within valid window
        election.open_voting(1200).unwrap();

        // Ballot submitted before start time rejected
        let early_err = election.validate_ballot_timing(999).unwrap_err();
        assert_eq!(
            early_err,
            ElectionCoreError::VotingNotStarted {
                start_time: 1000,
                current_time: 999
            }
        );

        // Ballot submitted after end time rejected
        let late_err = election.validate_ballot_timing(2001).unwrap_err();
        assert_eq!(
            late_err,
            ElectionCoreError::VotingDeadlinePassed {
                end_time: 2000,
                current_time: 2001
            }
        );

        // Ballot submitted at exact boundaries accepted
        assert!(election.validate_ballot_timing(1000).is_ok());
        assert!(election.validate_ballot_timing(2000).is_ok());
    }

    #[test]
    fn test_initialization_input_rejections() {
        // Short title rejected
        assert_eq!(
            ElectionState::new("ab", VALID_TEST_PK, None, None).unwrap_err(),
            ElectionCoreError::InvalidTitle
        );

        // Corrupted public key rejected
        assert!(matches!(
            ElectionState::new("Valid Title", "invalid_hex", None, None).unwrap_err(),
            ElectionCoreError::InvalidTrusteePublicKey(_)
        ));

        // Start time >= end time rejected
        assert_eq!(
            ElectionState::new("Valid Title", VALID_TEST_PK, Some(2000), Some(1000)).unwrap_err(),
            ElectionCoreError::InvalidTimeWindow {
                start: 2000,
                end: 1000
            }
        );
        assert_eq!(
            ElectionState::new("Valid Title", VALID_TEST_PK, Some(1000), Some(1000)).unwrap_err(),
            ElectionCoreError::InvalidTimeWindow {
                start: 1000,
                end: 1000
            }
        );

        // Missing roll commitment prevents opening
        let mut no_roll = ElectionState::new("Valid Title", VALID_TEST_PK, None, None).unwrap();
        assert_eq!(
            no_roll.open_voting(100).unwrap_err(),
            ElectionCoreError::MissingRollCommitment
        );

        // Unverified proof prevents finalize_tally
        let mut election = ElectionState::new("Valid Title", VALID_TEST_PK, None, None).unwrap();
        election.set_roll_commitment("hash", 1).unwrap();
        election.open_voting(100).unwrap();
        election.close_voting().unwrap();
        assert_eq!(
            election.finalize_tally(1, false).unwrap_err(),
            ElectionCoreError::UnverifiedDecryptionProof
        );
    }

    #[test]
    fn test_ballot_mathematical_validation_genuine_and_forged_proofs() {
        let mut rng = OsRng;
        let keypair = KeyPair::generate(&mut rng);
        let pk = keypair.pk;
        let pk_hex = pk.to_hex();
        let election = ElectionState::new("Ballot Test", pk_hex, None, None).unwrap();

        let voter_secret = b"secret_entropy_123";
        let election_id = "test_election_2026";
        let nullifier_bytes = compute_nullifier(voter_secret, election_id);

        // 1. Valid ballot with vote = 1
        let r1 = Fr::rand(&mut rng);
        let ct1 = encrypt_with_randomness(&pk, 1, &r1);
        let proof1 = generate_range_proof(&pk, &ct1, 1, &r1, &mut rng)
            .expect("Generate genuine range proof for vote 1");

        let valid_payload = BallotPayload {
            nullifier: nullifier_bytes.to_vec(),
            ciphertext: HexCiphertext::from_ciphertext(&ct1),
            range_proof: HexDisjunctiveRangeProof::from_proof(&proof1),
        };

        let res = election.validate_ballot_math(&valid_payload);
        assert!(res.is_ok(), "Genuine ballot with valid proof must verify");

        // 2. Valid ballot with vote = 0
        let r0 = Fr::rand(&mut rng);
        let ct0 = encrypt_with_randomness(&pk, 0, &r0);
        let proof0 = generate_range_proof(&pk, &ct0, 0, &r0, &mut rng)
            .expect("Generate genuine range proof for vote 0");

        let valid_payload_0 = BallotPayload {
            nullifier: nullifier_bytes.to_vec(),
            ciphertext: HexCiphertext::from_ciphertext(&ct0),
            range_proof: HexDisjunctiveRangeProof::from_proof(&proof0),
        };
        assert!(election.validate_ballot_math(&valid_payload_0).is_ok());

        // 3. Rejected: Invalid nullifier length (not 32 bytes)
        let bad_nullifier_payload = BallotPayload {
            nullifier: vec![0u8; 31],
            ciphertext: HexCiphertext::from_ciphertext(&ct1),
            range_proof: HexDisjunctiveRangeProof::from_proof(&proof1),
        };
        assert_eq!(
            election.validate_ballot_math(&bad_nullifier_payload).unwrap_err(),
            ElectionCoreError::InvalidNullifierLength { actual: 31 }
        );

        // 4. Rejected: Corrupted ciphertext point
        let bad_ct_payload = BallotPayload {
            nullifier: nullifier_bytes.to_vec(),
            ciphertext: HexCiphertext {
                c1_hex: "0xdeadbeef".to_string(),
                c2_hex: HexCiphertext::from_ciphertext(&ct1).c2_hex,
            },
            range_proof: HexDisjunctiveRangeProof::from_proof(&proof1),
        };
        assert!(matches!(
            election.validate_ballot_math(&bad_ct_payload).unwrap_err(),
            ElectionCoreError::InvalidCiphertext(_)
        ));

        // 5. Rejected: Forged / mismatched proof (proof for ct0 paired with ct1)
        let tampered_proof_payload = BallotPayload {
            nullifier: nullifier_bytes.to_vec(),
            ciphertext: HexCiphertext::from_ciphertext(&ct1),
            range_proof: HexDisjunctiveRangeProof::from_proof(&proof0), // Proof generated for different ciphertext!
        };
        assert!(matches!(
            election.validate_ballot_math(&tampered_proof_payload).unwrap_err(),
            ElectionCoreError::RangeProofFailed(_)
        ));
    }
}
