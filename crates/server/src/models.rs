use chrono::{DateTime, Utc};
use election_core::{ElectionPhase, HexChaumPedersenProof, HexCiphertext, HexDisjunctiveRangeProof};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub enum ElectionPhaseDto {
    Setup,
    Voting,
    Tallying,
    Complete,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct HexCiphertextDto {
    pub c1_hex: String,
    pub c2_hex: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct HexDisjunctiveRangeProofDto {
    pub a0_hex: String,
    pub b0_hex: String,
    pub a1_hex: String,
    pub b1_hex: String,
    pub c0_hex: String,
    pub c1_hex: String,
    pub s0_hex: String,
    pub s1_hex: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct HexChaumPedersenProofDto {
    pub a_hex: String,
    pub b_hex: String,
    pub z_hex: String,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct HealthResponse {
    pub status: String,
    pub database: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct ElectionDetailsResponse {
    pub id: String,
    pub title: String,
    pub trustee_pk_hex: String,
    #[schema(value_type = ElectionPhaseDto)]
    pub phase: ElectionPhase,
    pub start_time: Option<u64>,
    pub end_time: Option<u64>,
    pub roll_commitment_hex: Option<String>,
    pub credentials_issued_count: u64,
    pub credentials_used_count: u64,
    pub ballots_in_log_count: u64,
    pub chain_head_hash: String,
    pub final_tally: Option<u64>,
    pub proof_verified: bool,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct CreateElectionRequest {
    pub title: String,
    pub trustee_pk_hex: String,
    pub start_time: Option<u64>,
    pub end_time: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct IssueCredentialsRequest {
    pub count: u32,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct IssueCredentialsResponse {
    pub credentials: Vec<String>,
    pub count_issued: u32,
    pub warning: String,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct OpenVotingResponse {
    #[schema(value_type = ElectionPhaseDto)]
    pub phase: ElectionPhase,
    pub roll_commitment_hex: String,
    pub credentials_issued: u64,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct VoterLoginRequest {
    pub credential_code: String,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct VoterLoginResponse {
    pub session_token: String,
    pub expires_at: DateTime<Utc>,
    #[schema(value_type = ElectionPhaseDto)]
    pub election_phase: ElectionPhase,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct SubmitBallotRequest {
    pub nullifier_hex: String,
    #[schema(value_type = HexCiphertextDto)]
    pub ciphertext: HexCiphertext,
    #[schema(value_type = HexDisjunctiveRangeProofDto)]
    pub range_proof: HexDisjunctiveRangeProof,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct BallotReceiptResponse {
    pub sequence_number: i64,
    pub entry_hash: String,
    pub prev_hash: String,
    pub chain_head_hash: String,
    pub nullifier_hex: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BulletinEntry {
    pub sequence_number: i64,
    pub prev_hash: String,
    pub entry_hash: String,
    pub nullifier_hex: String,
    pub ciphertext_c1_hex: String,
    pub ciphertext_c2_hex: String,
    #[schema(value_type = HexDisjunctiveRangeProofDto)]
    pub range_proof: HexDisjunctiveRangeProof,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct BulletinLogResponse {
    pub entries: Vec<BulletinEntry>,
    pub total_count: usize,
    pub chain_head_hash: String,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct TallyCiphertextResponse {
    pub c1_hex: String,
    pub c2_hex: String,
    pub total_ballots: u64,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct FinalizeTallyRequest {
    #[schema(value_type = HexChaumPedersenProofDto)]
    pub proof: HexChaumPedersenProof,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct FinalizeTallyResponse {
    #[schema(value_type = ElectionPhaseDto)]
    pub phase: ElectionPhase,
    pub final_tally: u64,
    pub proof_verified: bool,
}
