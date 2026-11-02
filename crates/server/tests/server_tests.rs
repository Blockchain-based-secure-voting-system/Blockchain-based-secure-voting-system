use ark_bn254::Fr;
use ark_ff::UniformRand;
use election_core::ElectionPhase;
use reqwest::StatusCode;
use server::bulletin::compute_entry_hash;
use server::models::*;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU16, Ordering};
use voting_crypto::{
    compute_nullifier, generate_decryption_proof, encrypt_with_randomness, generate_range_proof,
    HexChaumPedersenProof, HexCiphertext, HexDisjunctiveRangeProof, KeyPair,
};

static PORT_COUNTER: AtomicU16 = AtomicU16::new(18080);

struct TestContext {
    base_url: String,
    pool: PgPool,
    admin_token: String,
}

async fn setup_test_app() -> TestContext {
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@127.0.0.1:5432/voting_test".to_string());

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .expect("Failed to connect to test Postgres database");

    // Run migrations
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    // Clean tables for test isolation
    sqlx::query(
        "TRUNCATE elections, voter_credentials, voter_sessions, auth_rate_limits, bulletin_log RESTART IDENTITY CASCADE;",
    )
    .execute(&pool)
    .await
    .expect("Failed to clean test tables");

    let admin_token = "test_admin_secret_token_12345".to_string();
    let port = PORT_COUNTER.fetch_add(1, Ordering::SeqCst);
    let app = server::build_app(pool.clone(), admin_token.clone());

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind listener");

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    TestContext {
        base_url: format!("http://127.0.0.1:{}", port),
        pool,
        admin_token,
    }
}

fn sample_ballot(
    trustee_pk: &voting_crypto::PublicKey,
    vote: u64,
    voter_secret: &[u8],
    election_id: &str,
) -> SubmitBallotRequest {
    let mut rng = rand::thread_rng();
    let r = Fr::rand(&mut rng);
    let ciphertext = encrypt_with_randomness(trustee_pk, vote, &r);
    let range_proof = generate_range_proof(trustee_pk, &ciphertext, vote, &r, &mut rng).unwrap();
    let nullifier = compute_nullifier(voter_secret, election_id);

    SubmitBallotRequest {
        nullifier_hex: hex::encode(nullifier),
        ciphertext: HexCiphertext::from_ciphertext(&ciphertext),
        range_proof: HexDisjunctiveRangeProof::from_proof(&range_proof),
    }
}

#[tokio::test]
async fn test_full_election_lifecycle() {
    let ctx = setup_test_app().await;
    let client = reqwest::Client::new();
    let mut rng = rand::thread_rng();
    let keypair = KeyPair::generate(&mut rng);
    let trustee_pk_hex = keypair.pk.to_hex();

    // 1. Health check
    let res = client
        .get(format!("{}/healthz", ctx.base_url))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let health: HealthResponse = res.json().await.unwrap();
    assert_eq!(health.status, "ok");

    // 2. Create election
    let create_req = CreateElectionRequest {
        title: "2026 Student Council Election".to_string(),
        trustee_pk_hex: trustee_pk_hex.clone(),
        start_time: None,
        end_time: None,
    };
    let res = client
        .post(format!("{}/api/v1/admin/election", ctx.base_url))
        .header("Authorization", format!("Bearer {}", ctx.admin_token))
        .json(&create_req)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let election: ElectionDetailsResponse = res.json().await.unwrap();
    assert_eq!(election.phase, ElectionPhase::Setup);

    // 3. Issue 2 credentials
    let issue_req = IssueCredentialsRequest { count: 2 };
    let res = client
        .post(format!("{}/api/v1/admin/credentials", ctx.base_url))
        .header("Authorization", format!("Bearer {}", ctx.admin_token))
        .json(&issue_req)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let issue_resp: IssueCredentialsResponse = res.json().await.unwrap();
    assert_eq!(issue_resp.credentials.len(), 2);
    let cred0 = issue_resp.credentials[0].clone();
    let cred1 = issue_resp.credentials[1].clone();

    // 4. Try voter login before voting is open -> Expect 400
    let res = client
        .post(format!("{}/api/v1/voter/login", ctx.base_url))
        .json(&VoterLoginRequest {
            credential_code: cred0.clone(),
        })
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    // 5. Open voting
    let res = client
        .post(format!("{}/api/v1/admin/open-voting", ctx.base_url))
        .header("Authorization", format!("Bearer {}", ctx.admin_token))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let open_resp: OpenVotingResponse = res.json().await.unwrap();
    assert_eq!(open_resp.phase, ElectionPhase::Voting);
    assert_eq!(open_resp.credentials_issued, 2);

    // 6. Voter 0 login
    let res = client
        .post(format!("{}/api/v1/voter/login", ctx.base_url))
        .json(&VoterLoginRequest {
            credential_code: cred0.clone(),
        })
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let login0: VoterLoginResponse = res.json().await.unwrap();
    assert_eq!(login0.election_phase, ElectionPhase::Voting);

    // 7. Voter 0 submits ballot for YES (vote = 1)
    let ballot0 = sample_ballot(
        &keypair.pk,
        1,
        cred0.as_bytes(),
        "default_election",
    );
    let res = client
        .post(format!("{}/api/v1/ballots", ctx.base_url))
        .header("Authorization", format!("Bearer {}", login0.session_token))
        .json(&ballot0)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let receipt0: BallotReceiptResponse = res.json().await.unwrap();
    assert_eq!(receipt0.sequence_number, 1);
    assert_eq!(receipt0.nullifier_hex, ballot0.nullifier_hex);

    // 8. Voter 1 login & submits ballot for NO (vote = 0)
    let res = client
        .post(format!("{}/api/v1/voter/login", ctx.base_url))
        .json(&VoterLoginRequest {
            credential_code: cred1.clone(),
        })
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let login1: VoterLoginResponse = res.json().await.unwrap();

    let ballot1 = sample_ballot(
        &keypair.pk,
        0,
        cred1.as_bytes(),
        "default_election",
    );
    let res = client
        .post(format!("{}/api/v1/ballots", ctx.base_url))
        .header("Authorization", format!("Bearer {}", login1.session_token))
        .json(&ballot1)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let receipt1: BallotReceiptResponse = res.json().await.unwrap();
    assert_eq!(receipt1.sequence_number, 2);
    assert_eq!(receipt1.prev_hash, receipt0.entry_hash);

    // 9. Close voting -> Tallying phase
    let res = client
        .post(format!("{}/api/v1/admin/close-voting", ctx.base_url))
        .header("Authorization", format!("Bearer {}", ctx.admin_token))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // 10. Fetch tally ciphertext (should be sum of vote 1 + vote 0 = 1)
    let res = client
        .get(format!("{}/api/v1/tally", ctx.base_url))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let tally_resp: TallyCiphertextResponse = res.json().await.unwrap();
    assert_eq!(tally_resp.total_ballots, 2);

    let hex_ct = HexCiphertext {
        c1_hex: tally_resp.c1_hex,
        c2_hex: tally_resp.c2_hex,
    };
    let tally_ciphertext = hex_ct.to_ciphertext().unwrap();

    // Trustee decrypts homomorphic sum (1 + 0 = 1) and creates Chaum-Pedersen proof
    let tally_val: u64 = 1;
    let proof = generate_decryption_proof(
        &keypair.sk,
        &keypair.pk,
        &tally_ciphertext,
        tally_val,
        &mut rng,
    );
    let finalize_req = FinalizeTallyRequest {
        proof: HexChaumPedersenProof::from_proof(&proof),
    };

    // 11. Finalize tally
    let res = client
        .post(format!("{}/api/v1/admin/finalize-tally", ctx.base_url))
        .header("Authorization", format!("Bearer {}", ctx.admin_token))
        .json(&finalize_req)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let finalize_resp: FinalizeTallyResponse = res.json().await.unwrap();
    assert_eq!(finalize_resp.phase, ElectionPhase::Complete);
    assert_eq!(finalize_resp.final_tally, 1);
    assert!(finalize_resp.proof_verified);

    // 12. Verify public bulletin board hash chain
    let res = client
        .get(format!("{}/api/v1/bulletin", ctx.base_url))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let bulletin: BulletinLogResponse = res.json().await.unwrap();
    assert_eq!(bulletin.entries.len(), 2);

    let mut expected_prev_hash = server::bulletin::GENESIS_HASH.to_string();
    for entry in &bulletin.entries {
        assert_eq!(entry.prev_hash, expected_prev_hash);
        let computed = compute_entry_hash(
            &entry.prev_hash,
            &entry.nullifier_hex,
            &entry.ciphertext_c1_hex,
            &entry.ciphertext_c2_hex,
            &entry.range_proof,
        );
        assert_eq!(entry.entry_hash, computed);
        expected_prev_hash = entry.entry_hash.clone();
    }
}

#[tokio::test]
async fn test_unique_nullifier_rejection_and_failing_twin() {
    let ctx = setup_test_app().await;
    let client = reqwest::Client::new();
    let mut rng = rand::thread_rng();
    let keypair = KeyPair::generate(&mut rng);

    // Create & open election
    client
        .post(format!("{}/api/v1/admin/election", ctx.base_url))
        .header("Authorization", format!("Bearer {}", ctx.admin_token))
        .json(&CreateElectionRequest {
            title: "Nullifier Test".to_string(),
            trustee_pk_hex: keypair.pk.to_hex(),
            start_time: None,
            end_time: None,
        })
        .send()
        .await
        .unwrap();

    let res = client
        .post(format!("{}/api/v1/admin/credentials", ctx.base_url))
        .header("Authorization", format!("Bearer {}", ctx.admin_token))
        .json(&IssueCredentialsRequest { count: 2 })
        .send()
        .await
        .unwrap();
    let issue_resp: IssueCredentialsResponse = res.json().await.unwrap();

    client
        .post(format!("{}/api/v1/admin/open-voting", ctx.base_url))
        .header("Authorization", format!("Bearer {}", ctx.admin_token))
        .send()
        .await
        .unwrap();

    // Login voter 0 and voter 1
    let login0: VoterLoginResponse = client
        .post(format!("{}/api/v1/voter/login", ctx.base_url))
        .json(&VoterLoginRequest {
            credential_code: issue_resp.credentials[0].clone(),
        })
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let login1: VoterLoginResponse = client
        .post(format!("{}/api/v1/voter/login", ctx.base_url))
        .json(&VoterLoginRequest {
            credential_code: issue_resp.credentials[1].clone(),
        })
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    // Both voters craft a ballot with the SAME nullifier (duplicate nullifier attack)
    let duplicate_nullifier = [0x42u8; 32];
    let r = Fr::rand(&mut rng);
    let ct = encrypt_with_randomness(&keypair.pk, 1, &r);
    let proof = generate_range_proof(&keypair.pk, &ct, 1, &r, &mut rng).unwrap();

    let ballot_submission = SubmitBallotRequest {
        nullifier_hex: hex::encode(duplicate_nullifier),
        ciphertext: HexCiphertext::from_ciphertext(&ct),
        range_proof: HexDisjunctiveRangeProof::from_proof(&proof),
    };

    // First submission succeeds
    let res0 = client
        .post(format!("{}/api/v1/ballots", ctx.base_url))
        .header("Authorization", format!("Bearer {}", login0.session_token))
        .json(&ballot_submission)
        .send()
        .await
        .unwrap();
    let status0 = res0.status();
    let text0 = res0.text().await.unwrap();
    assert_eq!(status0, StatusCode::OK, "res0 failed: {}", text0);

    // Second submission MUST fail with 409 Conflict
    let res1 = client
        .post(format!("{}/api/v1/ballots", ctx.base_url))
        .header("Authorization", format!("Bearer {}", login1.session_token))
        .json(&ballot_submission)
        .send()
        .await
        .unwrap();
    assert_eq!(res1.status(), StatusCode::CONFLICT);

    // FAILING TWIN DEMONSTRATION:
    // Verify that the relational engine UNIQUE constraint itself rejects any direct SQL insertion of the same nullifier.
    let direct_insert_res = sqlx::query(
        "INSERT INTO bulletin_log (sequence_number, prev_hash, entry_hash, nullifier_hex, ciphertext_c1_hex, ciphertext_c2_hex, range_proof_json)
         VALUES (999, '00', '00', $1, '00', '00', '{}')"
    )
    .bind(hex::encode(duplicate_nullifier))
    .execute(&ctx.pool)
    .await;

    assert!(
        direct_insert_res.is_err(),
        "Relational database constraint must reject duplicate nullifier"
    );
    let err_msg = direct_insert_res.unwrap_err().to_string();
    assert!(
        err_msg.contains("unique") || err_msg.contains("duplicate key") || err_msg.contains("bulletin_log_nullifier_hex_key"),
        "Error must cite unique key violation: {}", err_msg
    );
}

#[tokio::test]
async fn test_append_only_trigger_and_failing_twin() {
    let ctx = setup_test_app().await;

    // Insert an initial entry
    sqlx::query(
        "INSERT INTO bulletin_log (sequence_number, prev_hash, entry_hash, nullifier_hex, ciphertext_c1_hex, ciphertext_c2_hex, range_proof_json)
         VALUES (0, '00', '01', 'aa', 'bb', 'cc', '{}')"
    )
    .execute(&ctx.pool)
    .await
    .unwrap();

    // 1. Attempt UPDATE -> MUST FAIL via trigger
    let update_res = sqlx::query("UPDATE bulletin_log SET ciphertext_c1_hex = 'tampered' WHERE sequence_number = 0")
        .execute(&ctx.pool)
        .await;
    assert!(update_res.is_err());
    let err_msg = update_res.unwrap_err().to_string();
    assert!(
        err_msg.contains("UPDATE and DELETE operations are strictly prohibited on bulletin_log"),
        "Unexpected error: {}",
        err_msg
    );

    // 2. Attempt DELETE -> MUST FAIL via trigger
    let delete_res = sqlx::query("DELETE FROM bulletin_log WHERE sequence_number = 0")
        .execute(&ctx.pool)
        .await;
    assert!(delete_res.is_err());
    let err_msg = delete_res.unwrap_err().to_string();
    assert!(
        err_msg.contains("UPDATE and DELETE operations are strictly prohibited on bulletin_log"),
        "Unexpected error: {}",
        err_msg
    );
}

#[tokio::test]
async fn test_forged_range_proof_rejection() {
    let ctx = setup_test_app().await;
    let client = reqwest::Client::new();
    let mut rng = rand::thread_rng();
    let keypair = KeyPair::generate(&mut rng);

    // Setup & open
    client
        .post(format!("{}/api/v1/admin/election", ctx.base_url))
        .header("Authorization", format!("Bearer {}", ctx.admin_token))
        .json(&CreateElectionRequest {
            title: "Range Proof Test".to_string(),
            trustee_pk_hex: keypair.pk.to_hex(),
            start_time: None,
            end_time: None,
        })
        .send()
        .await
        .unwrap();

    let res = client
        .post(format!("{}/api/v1/admin/credentials", ctx.base_url))
        .header("Authorization", format!("Bearer {}", ctx.admin_token))
        .json(&IssueCredentialsRequest { count: 1 })
        .send()
        .await
        .unwrap();
    let issue_resp: IssueCredentialsResponse = res.json().await.unwrap();

    client
        .post(format!("{}/api/v1/admin/open-voting", ctx.base_url))
        .header("Authorization", format!("Bearer {}", ctx.admin_token))
        .send()
        .await
        .unwrap();

    let login: VoterLoginResponse = client
        .post(format!("{}/api/v1/voter/login", ctx.base_url))
        .json(&VoterLoginRequest {
            credential_code: issue_resp.credentials[0].clone(),
        })
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    // Construct ballot with FORGED range proof (vote = 5, invalid response scalars)
    let r = Fr::rand(&mut rng);
    let ct = encrypt_with_randomness(&keypair.pk, 5, &r);
    let mut forged_proof = generate_range_proof(&keypair.pk, &ct, 0, &r, &mut rng).unwrap();
    // Corrupt response scalar s0 to invalidate proof
    forged_proof.s0 = Fr::rand(&mut rng);

    let forged_ballot = SubmitBallotRequest {
        nullifier_hex: hex::encode(compute_nullifier(b"secret", "election")),
        ciphertext: HexCiphertext::from_ciphertext(&ct),
        range_proof: HexDisjunctiveRangeProof::from_proof(&forged_proof),
    };

    let res = client
        .post(format!("{}/api/v1/ballots", ctx.base_url))
        .header("Authorization", format!("Bearer {}", login.session_token))
        .json(&forged_ballot)
        .send()
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    let body = res.text().await.unwrap();
    assert!(
        body.contains("ZK range proof verification failed") || body.contains("range proof"),
        "Expected range proof rejection message, got: {}",
        body
    );
}

#[tokio::test]
async fn test_rate_limiting_login() {
    let ctx = setup_test_app().await;
    let client = reqwest::Client::new();
    let mut rng = rand::thread_rng();
    let keypair = KeyPair::generate(&mut rng);

    // Setup & open
    client
        .post(format!("{}/api/v1/admin/election", ctx.base_url))
        .header("Authorization", format!("Bearer {}", ctx.admin_token))
        .json(&CreateElectionRequest {
            title: "Rate Limit Test".to_string(),
            trustee_pk_hex: keypair.pk.to_hex(),
            start_time: None,
            end_time: None,
        })
        .send()
        .await
        .unwrap();

    client
        .post(format!("{}/api/v1/admin/open-voting", ctx.base_url))
        .header("Authorization", format!("Bearer {}", ctx.admin_token))
        .send()
        .await
        .unwrap();

    // 5 invalid login attempts
    for _ in 0..5 {
        let res = client
            .post(format!("{}/api/v1/voter/login", ctx.base_url))
            .json(&VoterLoginRequest {
                credential_code: "invalid_credential_code_123".to_string(),
            })
            .send()
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    // 6th attempt must be rejected with 429 Too Many Requests
    let res = client
        .post(format!("{}/api/v1/voter/login", ctx.base_url))
        .json(&VoterLoginRequest {
            credential_code: "invalid_credential_code_123".to_string(),
        })
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[test]
fn test_export_openapi_spec() {
    let spec = server::export_openapi_json();
    assert!(spec.contains("/api/v1/ballots"));
    assert!(spec.contains("/api/v1/voter/login"));
    assert!(spec.contains("/api/v1/bulletin"));
    let _ = std::fs::write("openapi.json", &spec);
}
