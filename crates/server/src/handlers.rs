use axum::{
    extract::{ConnectInfo, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{Duration, Utc};
use election_core::{
    verify_decryption_proof, BallotPayload, Ciphertext, ElectionCoreError, ElectionPhase,
    ElectionState, HexCiphertext, HexDisjunctiveRangeProof, PublicKey,
};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use std::net::SocketAddr;
use std::sync::Arc;

use crate::{
    auth::{
        generate_credential_code, generate_session_token, hash_credential_code, hash_session_token,
        verify_admin_token,
    },
    bulletin::{compute_entry_hash, GENESIS_HASH},
    error::AppError,
    models::*,
};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub admin_token: String,
}

pub type SharedState = Arc<AppState>;

fn extract_bearer_token(headers: &HeaderMap) -> Result<&str, AppError> {
    let auth_header = headers
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".to_string()))?;

    if let Some(token) = auth_header.strip_prefix("Bearer ") {
        Ok(token.trim())
    } else {
        Err(AppError::Unauthorized("Invalid Authorization header scheme, must be Bearer".to_string()))
    }
}

fn require_admin_auth(headers: &HeaderMap, expected_token: &str) -> Result<(), AppError> {
    let token = extract_bearer_token(headers)?;
    if !verify_admin_token(token, expected_token) {
        return Err(AppError::Forbidden("Invalid administrative authorization token".to_string()));
    }
    Ok(())
}

/// GET /healthz
#[utoipa::path(
    get,
    path = "/healthz",
    responses(
        (status = 200, description = "Service is healthy and connected to database", body = HealthResponse),
        (status = 500, description = "Database connection error")
    )
)]
pub async fn healthz(State(state): State<SharedState>) -> Result<Json<HealthResponse>, AppError> {
    sqlx::query("SELECT 1").execute(&state.pool).await?;

    Ok(Json(HealthResponse {
        status: "ok".to_string(),
        database: "connected".to_string(),
        timestamp: Utc::now(),
    }))
}

/// GET /api/v1/election
#[utoipa::path(
    get,
    path = "/api/v1/election",
    responses(
        (status = 200, description = "Current public election details, phase and metrics", body = ElectionDetailsResponse),
        (status = 404, description = "No election initialized")
    )
)]
pub async fn get_election(State(state): State<SharedState>) -> Result<Json<ElectionDetailsResponse>, AppError> {
    let row = sqlx::query(
        "SELECT id, title, trustee_pk_hex, phase, start_time, end_time, roll_commitment_hex, final_tally, decryption_proof_json
         FROM elections ORDER BY created_at DESC LIMIT 1",
    )
    .fetch_optional(&state.pool)
    .await?;

    let row = match row {
        Some(r) => r,
        None => {
            return Err(AppError::NotFound("No election has been initialized yet".to_string()));
        }
    };

    let id: String = row.get("id");
    let title: String = row.get("title");
    let trustee_pk_hex: String = row.get("trustee_pk_hex");
    let phase_str: String = row.get("phase");
    let phase = match phase_str.as_str() {
        "Setup" => ElectionPhase::Setup,
        "Voting" => ElectionPhase::Voting,
        "Tallying" => ElectionPhase::Tallying,
        "Complete" => ElectionPhase::Complete,
        _ => ElectionPhase::Setup,
    };
    let start_time: Option<i64> = row.get("start_time");
    let end_time: Option<i64> = row.get("end_time");
    let roll_commitment_hex: Option<String> = row.get("roll_commitment_hex");
    let final_tally: Option<i64> = row.get("final_tally");
    let proof_verified = row.get::<Option<serde_json::Value>, _>("decryption_proof_json").is_some();

    let creds_row = sqlx::query(
        "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_used = true) as used FROM voter_credentials",
    )
    .fetch_one(&state.pool)
    .await?;
    let credentials_issued_count: i64 = creds_row.get("total");
    let credentials_used_count: i64 = creds_row.get("used");

    let bulletin_row = sqlx::query(
        "SELECT COUNT(*) as total, COALESCE((SELECT entry_hash FROM bulletin_log ORDER BY sequence_number DESC LIMIT 1), $1) as head_hash
         FROM bulletin_log",
    )
    .bind(GENESIS_HASH)
    .fetch_one(&state.pool)
    .await?;

    let ballots_in_log_count: i64 = bulletin_row.get("total");
    let chain_head_hash: String = bulletin_row.get("head_hash");

    Ok(Json(ElectionDetailsResponse {
        id,
        title,
        trustee_pk_hex,
        phase,
        start_time: start_time.map(|t| t as u64),
        end_time: end_time.map(|t| t as u64),
        roll_commitment_hex,
        credentials_issued_count: credentials_issued_count as u64,
        credentials_used_count: credentials_used_count as u64,
        ballots_in_log_count: ballots_in_log_count as u64,
        chain_head_hash,
        final_tally: final_tally.map(|t| t as u64),
        proof_verified,
    }))
}

/// POST /api/v1/admin/election
#[utoipa::path(
    post,
    path = "/api/v1/admin/election",
    request_body = CreateElectionRequest,
    responses(
        (status = 200, description = "Election created in Setup phase", body = ElectionDetailsResponse),
        (status = 401, description = "Unauthorized"),
        (status = 400, description = "Invalid title, public key or time bounds")
    )
)]
pub async fn create_election(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<CreateElectionRequest>,
) -> Result<Json<ElectionDetailsResponse>, AppError> {
    require_admin_auth(&headers, &state.admin_token)?;

    let core_state = ElectionState::new(
        &payload.title,
        &payload.trustee_pk_hex,
        payload.start_time,
        payload.end_time,
    )?;

    let election_id = "default".to_string();

    sqlx::query(
        "INSERT INTO elections (id, title, trustee_pk_hex, phase, start_time, end_time)
         VALUES ($1, $2, $3, 'Setup', $4, $5)
         ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            trustee_pk_hex = EXCLUDED.trustee_pk_hex,
            phase = 'Setup',
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            roll_commitment_hex = NULL,
            final_tally = NULL,
            decryption_proof_json = NULL",
    )
    .bind(&election_id)
    .bind(&core_state.title)
    .bind(&core_state.trustee_pk_hex)
    .bind(core_state.start_time.map(|t| t as i64))
    .bind(core_state.end_time.map(|t| t as i64))
    .execute(&state.pool)
    .await?;

    Ok(Json(ElectionDetailsResponse {
        id: election_id,
        title: core_state.title,
        trustee_pk_hex: core_state.trustee_pk_hex,
        phase: ElectionPhase::Setup,
        start_time: core_state.start_time,
        end_time: core_state.end_time,
        roll_commitment_hex: None,
        credentials_issued_count: 0,
        credentials_used_count: 0,
        ballots_in_log_count: 0,
        chain_head_hash: GENESIS_HASH.to_string(),
        final_tally: None,
        proof_verified: false,
    }))
}

/// POST /api/v1/admin/credentials
#[utoipa::path(
    post,
    path = "/api/v1/admin/credentials",
    request_body = IssueCredentialsRequest,
    responses(
        (status = 200, description = "Batch of high-entropy credential codes (shown only once)", body = IssueCredentialsResponse),
        (status = 401, description = "Unauthorized"),
        (status = 400, description = "Not in Setup phase")
    )
)]
pub async fn issue_credentials(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<IssueCredentialsRequest>,
) -> Result<Json<IssueCredentialsResponse>, AppError> {
    require_admin_auth(&headers, &state.admin_token)?;

    if payload.count == 0 || payload.count > 1000 {
        return Err(AppError::BadRequest("Batch size must be between 1 and 1000".to_string()));
    }

    let election_row = sqlx::query("SELECT phase FROM elections ORDER BY created_at DESC LIMIT 1")
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Election must be initialized before issuing credentials".to_string()))?;

    let phase: String = election_row.get("phase");
    if phase != "Setup" {
        return Err(AppError::BadRequest("Voter credentials can only be issued during the Setup phase".to_string()));
    }

    let mut plaintext_codes = Vec::with_capacity(payload.count as usize);
    let mut code_hashes = Vec::with_capacity(payload.count as usize);

    for _ in 0..payload.count {
        let code = generate_credential_code();
        let hash = hash_credential_code(&code);
        plaintext_codes.push(code);
        code_hashes.push(hash);
    }

    let mut tx = state.pool.begin().await?;
    for hash in &code_hashes {
        sqlx::query("INSERT INTO voter_credentials (code_hash) VALUES ($1) ON CONFLICT DO NOTHING")
            .bind(hash)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    Ok(Json(IssueCredentialsResponse {
        credentials: plaintext_codes,
        count_issued: payload.count,
        warning: "SECURITY NOTICE: These one-time credential codes will never be displayed again. Deliver them to voters out-of-band.".to_string(),
    }))
}

/// POST /api/v1/admin/open-voting
#[utoipa::path(
    post,
    path = "/api/v1/admin/open-voting",
    responses(
        (status = 200, description = "Voting phase opened with published roll commitment", body = OpenVotingResponse),
        (status = 401, description = "Unauthorized"),
        (status = 400, description = "No credentials issued or deadline passed")
    )
)]
pub async fn open_voting(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<OpenVotingResponse>, AppError> {
    require_admin_auth(&headers, &state.admin_token)?;

    let election_row = sqlx::query(
        "SELECT id, title, trustee_pk_hex, phase, start_time, end_time FROM elections ORDER BY created_at DESC LIMIT 1",
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("No election configured".to_string()))?;

    let phase: String = election_row.get("phase");
    if phase != "Setup" {
        return Err(AppError::BadRequest("Election must be in Setup phase to open voting".to_string()));
    }

    let end_time: Option<i64> = election_row.get("end_time");
    let now_sec = Utc::now().timestamp() as u64;
    if let Some(end) = end_time {
        if end > 0 && now_sec >= end as u64 {
            return Err(AppError::ElectionCore(ElectionCoreError::DeadlineAlreadyElapsed {
                end_time: end as u64,
                current_time: now_sec,
            }));
        }
    }

    // Read all issued credential hashes sorted deterministically
    let hashes_rows = sqlx::query("SELECT code_hash FROM voter_credentials ORDER BY code_hash ASC")
        .fetch_all(&state.pool)
        .await?;

    if hashes_rows.is_empty() {
        return Err(AppError::BadRequest("Cannot open voting: at least one voter credential must be issued".to_string()));
    }

    let mut roll_hasher = Sha256::new();
    roll_hasher.update(b"ROLL_COMMITMENT_V1:");
    for r in &hashes_rows {
        let h: String = r.get("code_hash");
        roll_hasher.update(h.as_bytes());
        roll_hasher.update(b"\n");
    }
    let roll_commitment_hex = hex::encode(roll_hasher.finalize());

    let election_id: String = election_row.get("id");
    sqlx::query("UPDATE elections SET phase = 'Voting', roll_commitment_hex = $1 WHERE id = $2")
        .bind(&roll_commitment_hex)
        .bind(&election_id)
        .execute(&state.pool)
        .await?;

    Ok(Json(OpenVotingResponse {
        phase: ElectionPhase::Voting,
        roll_commitment_hex,
        credentials_issued: hashes_rows.len() as u64,
    }))
}

/// POST /api/v1/admin/close-voting
#[utoipa::path(
    post,
    path = "/api/v1/admin/close-voting",
    responses(
        (status = 200, description = "Voting closed, election transitioned to Tallying phase"),
        (status = 401, description = "Unauthorized"),
        (status = 400, description = "Election not in Voting phase")
    )
)]
pub async fn close_voting(State(state): State<SharedState>, headers: HeaderMap) -> Result<StatusCode, AppError> {
    require_admin_auth(&headers, &state.admin_token)?;

    let rows_affected = sqlx::query("UPDATE elections SET phase = 'Tallying' WHERE phase = 'Voting'")
        .execute(&state.pool)
        .await?
        .rows_affected();

    if rows_affected == 0 {
        return Err(AppError::BadRequest("Election is not currently in the Voting phase".to_string()));
    }

    Ok(StatusCode::OK)
}

/// POST /api/v1/voter/login
#[utoipa::path(
    post,
    path = "/api/v1/voter/login",
    request_body = VoterLoginRequest,
    responses(
        (status = 200, description = "Login successful, short-lived session token returned", body = VoterLoginResponse),
        (status = 401, description = "Invalid or consumed credential code"),
        (status = 429, description = "Rate limit exceeded (locked out due to guessing)")
    )
)]
pub async fn voter_login(
    State(state): State<SharedState>,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    Json(payload): Json<VoterLoginRequest>,
) -> Result<Json<VoterLoginResponse>, AppError> {
    let client_ip = connect_info
        .map(|ci| ci.0.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    // Rate limiting check: max 5 failed attempts in last 5 minutes
    let window_start = Utc::now() - Duration::minutes(5);
    let failed_attempts: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM auth_rate_limits WHERE client_ip = $1 AND success = false AND attempted_at >= $2",
    )
    .bind(&client_ip)
    .bind(window_start)
    .fetch_one(&state.pool)
    .await?;

    if failed_attempts >= 5 {
        return Err(AppError::RateLimited);
    }

    let code_hash = hash_credential_code(&payload.credential_code);

    let cred_row = sqlx::query("SELECT is_used FROM voter_credentials WHERE code_hash = $1")
        .bind(&code_hash)
        .fetch_optional(&state.pool)
        .await?;

    let is_used = match cred_row {
        Some(r) => {
            let used: bool = r.get("is_used");
            if used {
                // Record failed login because code is already consumed
                sqlx::query("INSERT INTO auth_rate_limits (client_ip, success) VALUES ($1, false)")
                    .bind(&client_ip)
                    .execute(&state.pool)
                    .await?;
                return Err(AppError::Unauthorized("Credential code has already been used to cast a ballot".to_string()));
            }
            false
        }
        None => {
            sqlx::query("INSERT INTO auth_rate_limits (client_ip, success) VALUES ($1, false)")
                .bind(&client_ip)
                .execute(&state.pool)
                .await?;
            return Err(AppError::Unauthorized("Invalid voter credential code".to_string()));
        }
    };

    let _ = is_used;

    // Record success
    sqlx::query("INSERT INTO auth_rate_limits (client_ip, success) VALUES ($1, true)")
        .bind(&client_ip)
        .execute(&state.pool)
        .await?;

    let phase_str: String = sqlx::query_scalar("SELECT phase FROM elections ORDER BY created_at DESC LIMIT 1")
        .fetch_optional(&state.pool)
        .await?
        .unwrap_or_else(|| "Setup".to_string());

    if phase_str != "Voting" {
        return Err(AppError::BadRequest(format!("Voting is not open (current phase: {})", phase_str)));
    }

    let (session_token, token_hash) = generate_session_token();
    let expires_at = Utc::now() + Duration::minutes(15);

    sqlx::query("INSERT INTO voter_sessions (token_hash, code_hash, expires_at) VALUES ($1, $2, $3)")
        .bind(&token_hash)
        .bind(&code_hash)
        .bind(expires_at)
        .execute(&state.pool)
        .await?;

    Ok(Json(VoterLoginResponse {
        session_token,
        expires_at,
        election_phase: ElectionPhase::Voting,
    }))
}

/// POST /api/v1/ballots
#[utoipa::path(
    post,
    path = "/api/v1/ballots",
    request_body = SubmitBallotRequest,
    responses(
        (status = 200, description = "Ballot mathematically validated and appended to ledger", body = BallotReceiptResponse),
        (status = 401, description = "Unauthorized voter session"),
        (status = 409, description = "Double-vote prevented (nullifier already recorded)"),
        (status = 400, description = "Range proof failure or voting deadline passed")
    )
)]
pub async fn submit_ballot(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<SubmitBallotRequest>,
) -> Result<Json<BallotReceiptResponse>, AppError> {
    let session_token = extract_bearer_token(&headers)?;
    let token_hash = hash_session_token(session_token);

    // Decode nullifier
    let nullifier_clean = payload.nullifier_hex.trim().trim_start_matches("0x");
    let nullifier_bytes = hex::decode(nullifier_clean)
        .map_err(|_| AppError::BadRequest("Invalid hex representation in nullifier".to_string()))?;

    if nullifier_bytes.len() != 32 {
        return Err(AppError::ElectionCore(ElectionCoreError::InvalidNullifierLength {
            actual: nullifier_bytes.len(),
        }));
    }

    let ballot_payload = BallotPayload {
        nullifier: nullifier_bytes.clone(),
        ciphertext: payload.ciphertext.clone(),
        range_proof: payload.range_proof.clone(),
    };

    // BEGIN ATOMIC TRANSACTION
    let mut tx = state.pool.begin().await?;

    // 1. Verify and consume voter session inside transaction
    let session_row = sqlx::query(
        "SELECT vs.code_hash, vs.expires_at, vc.is_used
         FROM voter_sessions vs
         JOIN voter_credentials vc ON vs.code_hash = vc.code_hash
         WHERE vs.token_hash = $1
         FOR UPDATE OF vc",
    )
    .bind(&token_hash)
    .fetch_optional(&mut *tx)
    .await?;

    let (code_hash, is_used) = match session_row {
        Some(r) => {
            let expires_at: chrono::DateTime<Utc> = r.get("expires_at");
            if Utc::now() > expires_at {
                return Err(AppError::Unauthorized("Voter session token has expired. Please log in again.".to_string()));
            }
            let used: bool = r.get("is_used");
            let hash: String = r.get("code_hash");
            (hash, used)
        }
        None => return Err(AppError::Unauthorized("Invalid or expired voter session token".to_string())),
    };

    if is_used {
        return Err(AppError::Conflict("Credential code has already been consumed to cast a ballot".to_string()));
    }

    // 2. Lock election row and verify timing & phase
    let election_row = sqlx::query(
        "SELECT title, trustee_pk_hex, phase, start_time, end_time FROM elections ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Election is not initialized".to_string()))?;

    let title: String = election_row.get("title");
    let trustee_pk_hex: String = election_row.get("trustee_pk_hex");
    let phase_str: String = election_row.get("phase");
    let phase = match phase_str.as_str() {
        "Voting" => ElectionPhase::Voting,
        "Tallying" => ElectionPhase::Tallying,
        "Complete" => ElectionPhase::Complete,
        _ => ElectionPhase::Setup,
    };
    let start_time: Option<i64> = election_row.get("start_time");
    let end_time: Option<i64> = election_row.get("end_time");

    let core_state = ElectionState {
        title,
        trustee_pk_hex,
        phase,
        start_time: start_time.map(|t| t as u64),
        end_time: end_time.map(|t| t as u64),
        roll_commitment_hex: None,
        credentials_issued_count: 0,
        credentials_used_count: 0,
        ballots_cast_count: 0,
        final_tally: None,
        proof_verified: false,
    };

    let server_now = Utc::now().timestamp() as u64;
    core_state.validate_ballot_timing(server_now)?;

    // 3. Mathematically validate ballot on BN254 G1 with range proof (0 or 1)
    core_state.validate_ballot_math(&ballot_payload)?;

    // 4. Mark credential as consumed
    sqlx::query("UPDATE voter_credentials SET is_used = true, used_at = NOW() WHERE code_hash = $1")
        .bind(&code_hash)
        .execute(&mut *tx)
        .await?;

    // 5. Read previous bulletin log entry hash
    let prev_row = sqlx::query("SELECT entry_hash FROM bulletin_log ORDER BY sequence_number DESC LIMIT 1 FOR UPDATE")
        .fetch_optional(&mut *tx)
        .await?;

    let prev_hash = prev_row
        .map(|r| r.get::<String, _>("entry_hash"))
        .unwrap_or_else(|| GENESIS_HASH.to_string());

    let entry_hash = compute_entry_hash(
        &prev_hash,
        nullifier_clean,
        &payload.ciphertext.c1_hex,
        &payload.ciphertext.c2_hex,
        &payload.range_proof,
    );

    let range_proof_json = serde_json::to_value(&payload.range_proof)
        .map_err(|e| AppError::Internal(format!("Failed to serialize range proof: {}", e)))?;

    // 6. Insert into bulletin_log (guarded by UNIQUE constraint on nullifier_hex and append-only trigger)
    let insert_row = sqlx::query(
        "INSERT INTO bulletin_log (prev_hash, entry_hash, nullifier_hex, ciphertext_c1_hex, ciphertext_c2_hex, range_proof_json)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING sequence_number",
    )
    .bind(&prev_hash)
    .bind(&entry_hash)
    .bind(nullifier_clean)
    .bind(&payload.ciphertext.c1_hex)
    .bind(&payload.ciphertext.c2_hex)
    .bind(range_proof_json)
    .fetch_one(&mut *tx)
    .await?;

    let seq_num: i64 = insert_row.get("sequence_number");

    // Commit atomic transaction
    tx.commit().await?;

    Ok(Json(BallotReceiptResponse {
        sequence_number: seq_num,
        entry_hash: entry_hash.clone(),
        prev_hash,
        chain_head_hash: entry_hash,
        nullifier_hex: nullifier_clean.to_string(),
        message: "Ballot cryptographically validated and recorded on append-only bulletin ledger".to_string(),
    }))
}

/// GET /api/v1/bulletin
#[utoipa::path(
    get,
    path = "/api/v1/bulletin",
    responses(
        (status = 200, description = "Complete append-only bulletin board ledger", body = BulletinLogResponse)
    )
)]
pub async fn get_bulletin(State(state): State<SharedState>) -> Result<Json<BulletinLogResponse>, AppError> {
    let rows = sqlx::query(
        "SELECT sequence_number, prev_hash, entry_hash, nullifier_hex, ciphertext_c1_hex, ciphertext_c2_hex, range_proof_json
         FROM bulletin_log ORDER BY sequence_number ASC",
    )
    .fetch_all(&state.pool)
    .await?;

    let mut entries = Vec::with_capacity(rows.len());
    let mut head_hash = GENESIS_HASH.to_string();

    for r in rows {
        let seq: i64 = r.get("sequence_number");
        let prev: String = r.get("prev_hash");
        let entry: String = r.get("entry_hash");
        let nullifier: String = r.get("nullifier_hex");
        let c1: String = r.get("ciphertext_c1_hex");
        let c2: String = r.get("ciphertext_c2_hex");
        let proof_val: serde_json::Value = r.get("range_proof_json");
        let proof: HexDisjunctiveRangeProof = serde_json::from_value(proof_val)
            .map_err(|e| AppError::Internal(format!("Corrupt proof in bulletin log: {}", e)))?;

        head_hash = entry.clone();

        entries.push(BulletinEntry {
            sequence_number: seq,
            prev_hash: prev,
            entry_hash: entry,
            nullifier_hex: nullifier,
            ciphertext_c1_hex: c1,
            ciphertext_c2_hex: c2,
            range_proof: proof,
        });
    }

    let count = entries.len();
    Ok(Json(BulletinLogResponse {
        entries,
        total_count: count,
        chain_head_hash: head_hash,
    }))
}

/// GET /api/v1/tally
#[utoipa::path(
    get,
    path = "/api/v1/tally",
    responses(
        (status = 200, description = "Homomorphic sum ciphertext calculated across all ballots", body = TallyCiphertextResponse)
    )
)]
pub async fn get_tally(State(state): State<SharedState>) -> Result<Json<TallyCiphertextResponse>, AppError> {
    let rows = sqlx::query("SELECT ciphertext_c1_hex, ciphertext_c2_hex FROM bulletin_log ORDER BY sequence_number ASC")
        .fetch_all(&state.pool)
        .await?;

    let mut sum = Ciphertext::zero();
    let count = rows.len() as u64;

    for r in rows {
        let c1: String = r.get("ciphertext_c1_hex");
        let c2: String = r.get("ciphertext_c2_hex");
        let ct = HexCiphertext { c1_hex: c1, c2_hex: c2 }
            .to_ciphertext()
            .map_err(|e| AppError::Internal(format!("Corrupt ciphertext point in bulletin ledger: {}", e)))?;
        sum = sum.homomorphic_add(&ct);
    }

    let hex_sum = HexCiphertext::from_ciphertext(&sum);
    Ok(Json(TallyCiphertextResponse {
        c1_hex: hex_sum.c1_hex,
        c2_hex: hex_sum.c2_hex,
        total_ballots: count,
    }))
}

/// POST /api/v1/admin/finalize-tally
#[utoipa::path(
    post,
    path = "/api/v1/admin/finalize-tally",
    request_body = FinalizeTallyRequest,
    responses(
        (status = 200, description = "Chaum-Pedersen decryption proof verified and tally finalized", body = FinalizeTallyResponse),
        (status = 400, description = "Invalid decryption proof or wrong phase")
    )
)]
pub async fn finalize_tally(
    State(state): State<SharedState>,
    Json(payload): Json<FinalizeTallyRequest>,
) -> Result<Json<FinalizeTallyResponse>, AppError> {
    let election_row = sqlx::query(
        "SELECT id, trustee_pk_hex, phase FROM elections ORDER BY created_at DESC LIMIT 1",
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Election not found".to_string()))?;

    let phase_str: String = election_row.get("phase");
    if phase_str != "Tallying" {
        return Err(AppError::BadRequest("Election must be in Tallying phase to submit decryption proof".to_string()));
    }

    let trustee_pk_hex: String = election_row.get("trustee_pk_hex");
    let trustee_pk = PublicKey::from_hex(&trustee_pk_hex)
        .map_err(|e| AppError::BadRequest(format!("Invalid trustee public key: {}", e)))?;

    // Compute homomorphic sum from bulletin log
    let rows = sqlx::query("SELECT ciphertext_c1_hex, ciphertext_c2_hex FROM bulletin_log ORDER BY sequence_number ASC")
        .fetch_all(&state.pool)
        .await?;

    let mut sum = Ciphertext::zero();
    for r in rows {
        let c1: String = r.get("ciphertext_c1_hex");
        let c2: String = r.get("ciphertext_c2_hex");
        let ct = HexCiphertext { c1_hex: c1, c2_hex: c2 }
            .to_ciphertext()
            .map_err(|e| AppError::Internal(format!("Corrupt ciphertext point in bulletin ledger: {}", e)))?;
        sum = sum.homomorphic_add(&ct);
    }

    let proof = payload.proof.to_proof()
        .map_err(|e| AppError::BadRequest(format!("Invalid Chaum-Pedersen proof format: {}", e)))?;

    verify_decryption_proof(&trustee_pk, &sum, &proof)
        .map_err(|e| AppError::Crypto(format!("Chaum-Pedersen decryption proof verification failed: {}", e)))?;

    let proof_json = serde_json::to_value(&payload.proof)
        .map_err(|e| AppError::Internal(format!("Failed to serialize proof: {}", e)))?;

    let election_id: String = election_row.get("id");
    sqlx::query(
        "UPDATE elections SET phase = 'Complete', final_tally = $1, decryption_proof_json = $2 WHERE id = $3",
    )
    .bind(proof.decrypted_tally as i64)
    .bind(proof_json)
    .bind(&election_id)
    .execute(&state.pool)
    .await?;

    Ok(Json(FinalizeTallyResponse {
        phase: ElectionPhase::Complete,
        final_tally: proof.decrypted_tally,
        proof_verified: true,
    }))
}
