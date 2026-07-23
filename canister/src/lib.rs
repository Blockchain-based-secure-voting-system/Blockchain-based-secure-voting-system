use candid::{CandidType, Deserialize, Principal};
use ic_cdk::api::time;
use ic_cdk::caller;
use ic_cdk_macros::*;
use std::cell::RefCell;
use std::collections::BTreeSet;

use voting_crypto::{
    g1_from_hex, g1_to_hex, verify_decryption_proof, Ciphertext, HexChaumPedersenProof,
    HexCiphertext, PublicKey,
};

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

        // 5. Verify Ciphertext Curve Validity
        let ct = ballot
            .ciphertext
            .to_ciphertext()
            .map_err(|e| format!("Invalid ciphertext points on BN254 G1: {}", e))?;

        // 6. Record Nullifier & Homomorphically Add Ballot
        state.used_nullifiers.insert(ballot.nullifier);
        state.encrypted_sum = state.encrypted_sum.homomorphic_add(&ct);
        state.total_ballots_cast += 1;

        Ok("Ballot successfully recorded and added to homomorphic tally".to_string())
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
