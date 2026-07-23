use candid::{CandidType, Deserialize, Principal};
use ic_cdk::api::time;
use ic_cdk::caller;
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update};
use std::cell::RefCell;
use std::collections::BTreeSet;

use voting_crypto::{
    g1_from_hex, g1_to_hex, verify_decryption_proof, verify_range_proof, Ciphertext,
    HexChaumPedersenProof, HexCiphertext, HexDisjunctiveRangeProof, PublicKey,
};

#[cfg(target_arch = "wasm32")]
fn dummy_getrandom(_buf: &mut [u8]) -> Result<(), getrandom::Error> {
    Err(getrandom::Error::UNSUPPORTED)
}

#[cfg(target_arch = "wasm32")]
getrandom::register_custom_getrandom!(dummy_getrandom);

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum ElectionPhase {
    Setup,
    Voting,
    Tallying,
    Complete,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct Ballot {
    pub nullifier: Vec<u8>,
    pub ciphertext: HexCiphertext,
    pub range_proof: HexDisjunctiveRangeProof,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct EncryptedTally {
    pub c1_hex: String,
    pub c2_hex: String,
    pub total_ballots: u64,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct ElectionDetails {
    pub title: String,
    pub admin: Principal,
    pub trustee_pk_hex: String,
    pub phase: ElectionPhase,
    pub start_time: u64,
    pub end_time: u64,
    pub registered_voters_count: u64,
    pub total_ballots_cast: u64,
    pub final_tally: Option<u64>,
    pub proof_verified: bool,
}

/// Serialized state structure for stable memory pre_upgrade/post_upgrade persistence
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct StableState {
    pub title: String,
    pub admin: Principal,
    pub trustee_pk_hex: String,
    pub phase: ElectionPhase,
    pub start_time: u64,
    pub end_time: u64,
    pub registered_voters: Vec<Principal>,
    pub used_nullifiers: Vec<Vec<u8>>,
    pub c1_hex: String,
    pub c2_hex: String,
    pub total_ballots_cast: u64,
    pub final_tally: Option<u64>,
    pub proof_verified: bool,
}

struct State {
    title: String,
    admin: Principal,
    trustee_pk_hex: String,
    phase: ElectionPhase,
    start_time: u64,
    end_time: u64,
    registered_voters: BTreeSet<Principal>,
    used_nullifiers: BTreeSet<Vec<u8>>,
    encrypted_sum: Ciphertext,
    total_ballots_cast: u64,
    final_tally: Option<u64>,
    proof_verified: bool,
}

impl Default for State {
    fn default() -> Self {
        Self {
            title: "Uninitialized Election".to_string(),
            admin: Principal::anonymous(),
            trustee_pk_hex: String::new(),
            phase: ElectionPhase::Setup,
            start_time: 0,
            end_time: 0,
            registered_voters: BTreeSet::new(),
            used_nullifiers: BTreeSet::new(),
            encrypted_sum: Ciphertext::zero(),
            total_ballots_cast: 0,
            final_tally: None,
            proof_verified: false,
        }
    }
}

thread_local! {
    static STATE: RefCell<State> = RefCell::new(State::default());
}

#[init]
fn init() {
    STATE.with(|s| {
        let mut state = s.borrow_mut();
        state.admin = caller();
    });
}

#[pre_upgrade]
fn pre_upgrade() {
    STATE.with(|s| {
        let state = s.borrow();
        let stable_state = StableState {
            title: state.title.clone(),
            admin: state.admin,
            trustee_pk_hex: state.trustee_pk_hex.clone(),
            phase: state.phase.clone(),
            start_time: state.start_time,
            end_time: state.end_time,
            registered_voters: state.registered_voters.iter().cloned().collect(),
            used_nullifiers: state.used_nullifiers.iter().cloned().collect(),
            c1_hex: g1_to_hex(&state.encrypted_sum.c1),
            c2_hex: g1_to_hex(&state.encrypted_sum.c2),
            total_ballots_cast: state.total_ballots_cast,
            final_tally: state.final_tally,
            proof_verified: state.proof_verified,
        };
        ic_cdk::storage::stable_save((stable_state,)).expect("Failed to save state to stable storage");
    });
}

#[post_upgrade]
fn post_upgrade() {
    let (stable_state,): (StableState,) =
        ic_cdk::storage::stable_restore().expect("Failed to restore state from stable storage");

    let c1 = g1_from_hex(&stable_state.c1_hex).unwrap_or_else(|_| Ciphertext::zero().c1);
    let c2 = g1_from_hex(&stable_state.c2_hex).unwrap_or_else(|_| Ciphertext::zero().c2);

    STATE.with(|s| {
        let mut state = s.borrow_mut();
        state.title = stable_state.title;
        state.admin = stable_state.admin;
        state.trustee_pk_hex = stable_state.trustee_pk_hex;
        state.phase = stable_state.phase;
        state.start_time = stable_state.start_time;
        state.end_time = stable_state.end_time;
        state.registered_voters = stable_state.registered_voters.into_iter().collect();
        state.used_nullifiers = stable_state.used_nullifiers.into_iter().collect();
        state.encrypted_sum = Ciphertext::new(c1, c2);
        state.total_ballots_cast = stable_state.total_ballots_cast;
        state.final_tally = stable_state.final_tally;
        state.proof_verified = stable_state.proof_verified;
    });
}

#[update]
fn create_election(
    title: String,
    trustee_pk_hex: String,
    start_time: u64,
    end_time: u64,
) -> Result<String, String> {
    STATE.with(|s| {
        let mut state = s.borrow_mut();
        let caller_principal = caller();

        if state.admin != Principal::anonymous() && state.admin != caller_principal {
            return Err("Only the canister admin can initialize an election".to_string());
        }

        // Validate public key format
        PublicKey::from_hex(&trustee_pk_hex)
            .map_err(|e| format!("Invalid trustee public key hex: {}", e))?;

        if start_time >= end_time {
            return Err("Election start_time must be earlier than end_time".to_string());
        }

        state.title = title;
        state.admin = caller_principal;
        state.trustee_pk_hex = trustee_pk_hex;
        state.start_time = start_time;
        state.end_time = end_time;
        state.phase = ElectionPhase::Setup;
        state.registered_voters.clear();
        state.used_nullifiers.clear();
        state.encrypted_sum = Ciphertext::zero();
        state.total_ballots_cast = 0;
        state.final_tally = None;
        state.proof_verified = false;

        Ok("Election created successfully in Setup phase".to_string())
    })
}

#[update]
fn register_voters(voters: Vec<Principal>) -> Result<u64, String> {
    STATE.with(|s| {
        let mut state = s.borrow_mut();
        if caller() != state.admin {
            return Err("Only the election admin can register voters".to_string());
        }
        if state.phase != ElectionPhase::Setup {
            return Err("Voters can only be registered during the Setup phase".to_string());
        }

        let mut added = 0;
        for voter in voters {
            if state.registered_voters.insert(voter) {
                added += 1;
            }
        }

        Ok(added)
    })
}

#[update]
fn open_voting() -> Result<String, String> {
    STATE.with(|s| {
        let mut state = s.borrow_mut();
        if caller() != state.admin {
            return Err("Only admin can open voting".to_string());
        }
        if state.phase != ElectionPhase::Setup {
            return Err("Election must be in Setup phase to open voting".to_string());
        }
        if state.trustee_pk_hex.is_empty() {
            return Err("Trustee public key must be set before opening voting".to_string());
        }

        state.phase = ElectionPhase::Voting;
        Ok("Voting phase is now OPEN".to_string())
    })
}

#[update]
fn cast_ballot(ballot: Ballot) -> Result<String, String> {
    STATE.with(|s| {
        let mut state = s.borrow_mut();
        let voter = caller();

        // 1. Verify Phase
        if state.phase != ElectionPhase::Voting {
            return Err("Voting is not currently open".to_string());
        }

        // 2. Verify Time Window (if timestamps are set)
        let now = time();
        if state.start_time > 0 && now < state.start_time {
            return Err("Voting period has not started yet".to_string());
        }
        if state.end_time > 0 && now > state.end_time {
            return Err("Voting period has ended".to_string());
        }

        // 3. Verify Voter Eligibility
        if !state.registered_voters.contains(&voter) {
            return Err(format!("Caller Principal {} is not registered to vote", voter));
        }

        // 4. Verify Nullifier Uniqueness (Double-Vote Prevention)
        if ballot.nullifier.len() != 32 {
            return Err("Nullifier must be exactly 32 bytes".to_string());
        }
        if state.used_nullifiers.contains(&ballot.nullifier) {
            return Err("Double-vote detected: nullifier has already been submitted".to_string());
        }

        // 5. Verify Trustee Public Key Existence
        let trustee_pk = PublicKey::from_hex(&state.trustee_pk_hex)
            .map_err(|e| format!("Corrupt trustee PK in canister state: {}", e))?;

        // 6. Verify Ciphertext Curve Validity
        let ct = ballot
            .ciphertext
            .to_ciphertext()
            .map_err(|e| format!("Invalid ciphertext points on BN254 G1: {}", e))?;

        // 7. Verify 1-out-of-2 Disjunctive Chaum-Pedersen Zero-Knowledge Range Proof (m in {0, 1})
        let range_proof = ballot
            .range_proof
            .to_proof()
            .map_err(|e| format!("Invalid range proof deserialization: {}", e))?;

        verify_range_proof(&trustee_pk, &ct, &range_proof).map_err(|e| {
            format!(
                "Ballot Validity Proof Failed: Ciphertext does not encode valid vote 0 or 1 ({})",
                e
            )
        })?;

        // 8. Record Nullifier & Homomorphically Add Ballot
        state.used_nullifiers.insert(ballot.nullifier);
        state.encrypted_sum = state.encrypted_sum.homomorphic_add(&ct);
        state.total_ballots_cast += 1;

        Ok("Ballot successfully validated with ZK Range Proof and added to homomorphic tally".to_string())
    })
}

#[update]
fn close_voting() -> Result<String, String> {
    STATE.with(|s| {
        let mut state = s.borrow_mut();
        if caller() != state.admin {
            return Err("Only admin can close voting".to_string());
        }
        if state.phase != ElectionPhase::Voting {
            return Err("Election is not currently in Voting phase".to_string());
        }

        state.phase = ElectionPhase::Tallying;
        Ok("Voting closed. Election is now in Tallying phase".to_string())
    })
}

#[update]
fn submit_decryption_proof(hex_proof: HexChaumPedersenProof) -> Result<u64, String> {
    STATE.with(|s| {
        let mut state = s.borrow_mut();

        if state.phase != ElectionPhase::Tallying {
            return Err("Canister is not in Tallying phase".to_string());
        }

        let trustee_pk = PublicKey::from_hex(&state.trustee_pk_hex)
            .map_err(|e| format!("Corrupt trustee PK in canister state: {}", e))?;

        let proof = hex_proof
            .to_proof()
            .map_err(|e| format!("Invalid proof deserialization: {}", e))?;

        // Verify Chaum-Pedersen ZK Proof against stored homomorphic sum
        verify_decryption_proof(&trustee_pk, &state.encrypted_sum, &proof)
            .map_err(|e| format!("Chaum-Pedersen Zero-Knowledge Proof VERIFICATION FAILED: {}", e))?;

        // Finalize Election State
        state.final_tally = Some(proof.decrypted_tally);
        state.proof_verified = true;
        state.phase = ElectionPhase::Complete;

        Ok(proof.decrypted_tally)
    })
}

#[query]
fn get_election_details() -> ElectionDetails {
    STATE.with(|s| {
        let state = s.borrow();
        ElectionDetails {
            title: state.title.clone(),
            admin: state.admin,
            trustee_pk_hex: state.trustee_pk_hex.clone(),
            phase: state.phase.clone(),
            start_time: state.start_time,
            end_time: state.end_time,
            registered_voters_count: state.registered_voters.len() as u64,
            total_ballots_cast: state.total_ballots_cast,
            final_tally: state.final_tally,
            proof_verified: state.proof_verified,
        }
    })
}

#[query]
fn get_encrypted_tally() -> Result<EncryptedTally, String> {
    STATE.with(|s| {
        let state = s.borrow();
        Ok(EncryptedTally {
            c1_hex: g1_to_hex(&state.encrypted_sum.c1),
            c2_hex: g1_to_hex(&state.encrypted_sum.c2),
            total_ballots: state.total_ballots_cast,
        })
    })
}

#[query]
fn is_voter_registered(voter: Principal) -> bool {
    STATE.with(|s| s.borrow().registered_voters.contains(&voter))
}

#[query]
fn has_nullifier_been_used(nullifier: Vec<u8>) -> bool {
    STATE.with(|s| s.borrow().used_nullifiers.contains(&nullifier))
}

// Generate candid interface automatically
ic_cdk::export_candid!();

#[cfg(test)]
mod tests {
    use super::*;
    use rand::thread_rng;
    use voting_crypto::{encrypt, generate_range_proof, compute_nullifier, KeyPair};

    #[test]
    fn test_canister_election_lifecycle_and_phase_guards() {
        let mut rng = thread_rng();
        let keypair = KeyPair::generate(&mut rng);
        let trustee_pk_hex = keypair.pk.to_hex();

        // 1. Create election
        let create_res = create_election(
            "Test Referendum".to_string(),
            trustee_pk_hex.clone(),
            100,
            200,
        );
        assert!(create_res.is_ok());

        let details = get_election_details();
        assert_eq!(details.phase, ElectionPhase::Setup);

        // 2. Guard Check: Cannot cast ballot in Setup phase
        let dummy_ballot = Ballot {
            nullifier: vec![0u8; 32],
            ciphertext: HexCiphertext {
                c1_hex: "".to_string(),
                c2_hex: "".to_string(),
            },
            range_proof: HexDisjunctiveRangeProof {
                a0_hex: "".to_string(),
                b0_hex: "".to_string(),
                a1_hex: "".to_string(),
                b1_hex: "".to_string(),
                c0_hex: "".to_string(),
                c1_hex: "".to_string(),
                s0_hex: "".to_string(),
                s1_hex: "".to_string(),
            },
        };

        let cast_err = cast_ballot(dummy_ballot.clone());
        assert!(cast_err.is_err());
        assert_eq!(cast_err.unwrap_err(), "Voting is not currently open");

        // 3. Register voters in Setup phase
        let voter_principal = Principal::anonymous();
        let reg_res = register_voters(vec![voter_principal]);
        assert_eq!(reg_res.unwrap(), 1);
        assert!(is_voter_registered(voter_principal));

        // 4. Open voting
        let open_res = open_voting();
        assert!(open_res.is_ok());
        assert_eq!(get_election_details().phase, ElectionPhase::Voting);

        // 5. Guard Check: Cannot register voters when voting is OPEN
        let reg_open_err = register_voters(vec![voter_principal]);
        assert!(reg_open_err.is_err());

        // 6. Cast valid ballot in Voting phase
        let (ct, r) = encrypt(&keypair.pk, 1, &mut rng);
        let hex_ct = HexCiphertext::from_ciphertext(&ct);
        let range_proof = generate_range_proof(&keypair.pk, &ct, 1, &r, &mut rng).unwrap();
        let hex_range_proof = HexDisjunctiveRangeProof::from_proof(&range_proof);
        let nullifier = compute_nullifier(b"voter_secret_alice", "test_election");

        let valid_ballot = Ballot {
            nullifier: nullifier.to_vec(),
            ciphertext: hex_ct,
            range_proof: hex_range_proof,
        };

        let cast_res = cast_ballot(valid_ballot.clone());
        assert!(cast_res.is_ok());
        assert!(has_nullifier_been_used(nullifier.to_vec()));

        // 7. Guard Check: Double-voting prevention
        let double_vote_err = cast_ballot(valid_ballot);
        assert!(double_vote_err.is_err());
        assert!(double_vote_err.unwrap_err().contains("Double-vote detected"));

        // 8. Close voting
        let close_res = close_voting();
        assert!(close_res.is_ok());
        assert_eq!(get_election_details().phase, ElectionPhase::Tallying);

        // 9. Guard Check: Cannot cast ballot in Tallying phase
        let cast_tally_err = cast_ballot(dummy_ballot);
        assert!(cast_tally_err.is_err());
    }
}
