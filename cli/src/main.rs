mod verifier;

use anyhow::{anyhow, Context, Result};
use ark_bn254::{Fr, G1Projective};
use ark_ec::Group;
use ark_ff::UniformRand;
use clap::{Parser, Subcommand};
use rand::thread_rng;
use server::models::*;
use voting_crypto::{
    combine_shares, compute_nullifier, encrypt_with_randomness, fr_to_hex,
    generate_decryption_proof, generate_range_proof, generate_threshold_keypair,
    solve_discrete_log, HexChaumPedersenProof, HexCiphertext, HexDisjunctiveRangeProof,
    HexKeyShare, KeyPair, PublicKey,
};

#[derive(Parser)]
#[command(name = "voting-cli")]
#[command(about = "CLI & Verification Tool for Axum + Postgres Zero-Knowledge Electronic Voting System", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Generate a new Single-Trustee ElGamal KeyPair over BN254 G1
    Keygen,

    /// Trusted Dealer Setup: Generate n-of-m Shamir Threshold Key Shares
    KeygenThreshold {
        #[arg(long, default_value = "3")]
        threshold: u64,

        #[arg(long, default_value = "5")]
        total_shares: u64,
    },

    /// Combine n threshold key shares to reconstruct master secret key
    CombineThresholdShares {
        #[arg(long)]
        shares: Vec<String>,
    },

    /// Create and initialize an election on the Axum server
    CreateElection {
        #[arg(long, default_value = "http://127.0.0.1:8080")]
        url: String,

        #[arg(long)]
        admin_token: String,

        #[arg(long)]
        title: String,

        #[arg(long)]
        trustee_pk: String,

        #[arg(long)]
        start_time: Option<u64>,

        #[arg(long)]
        end_time: Option<u64>,
    },

    /// Issue single-use 128-bit voter credentials (admin only)
    IssueCredentials {
        #[arg(long, default_value = "http://127.0.0.1:8080")]
        url: String,

        #[arg(long)]
        admin_token: String,

        #[arg(long, default_value = "5")]
        count: u32,
    },

    /// Transition election phase to Voting (computes roll commitment)
    OpenVoting {
        #[arg(long, default_value = "http://127.0.0.1:8080")]
        url: String,

        #[arg(long)]
        admin_token: String,
    },

    /// Cast an encrypted vote (0 or 1) with 1-out-of-2 ZK Range Proof
    CastVote {
        #[arg(long, default_value = "http://127.0.0.1:8080")]
        url: String,

        #[arg(long)]
        credential_code: String,

        #[arg(long)]
        vote: u64,
    },

    /// Transition election phase to Tallying (closes voting)
    CloseVoting {
        #[arg(long, default_value = "http://127.0.0.1:8080")]
        url: String,

        #[arg(long)]
        admin_token: String,
    },

    /// Single Trustee: fetch tally ciphertext, decrypt via BSGS, generate Chaum-Pedersen proof, and submit
    TallyDecryptAndProve {
        #[arg(long, default_value = "http://127.0.0.1:8080")]
        url: String,

        #[arg(long)]
        admin_token: String,

        #[arg(long)]
        trustee_sk: String,

        #[arg(long, default_value = "1000000")]
        max_bound: u64,
    },

    /// Threshold Trustees: decrypt tally using n-of-m threshold key shares, generate proof, and submit
    TallyDecryptThresholdAndProve {
        #[arg(long, default_value = "http://127.0.0.1:8080")]
        url: String,

        #[arg(long)]
        admin_token: String,

        #[arg(long)]
        shares: Vec<String>,

        #[arg(long, default_value = "1000000")]
        max_bound: u64,
    },

    /// Query current status of election
    Status {
        #[arg(long, default_value = "http://127.0.0.1:8080")]
        url: String,
    },

    /// Independent bulletin board audit and tally verification
    Verify {
        #[arg(long, default_value = "http://127.0.0.1:8080")]
        url: String,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let client = reqwest::Client::new();

    match cli.command {
        Commands::Keygen => {
            let mut rng = thread_rng();
            let keypair = KeyPair::generate(&mut rng);
            println!("Single Trustee KeyPair Generated:");
            println!("Public Key  (Hex G1): {}", keypair.pk.to_hex());
            println!("Secret Key  (Hex Fr): {}", fr_to_hex(&keypair.sk));
        }

        Commands::KeygenThreshold { threshold, total_shares } => {
            let mut rng = thread_rng();
            let tkp = generate_threshold_keypair(threshold, total_shares, &mut rng)?;
            println!("Threshold Key Setup (Threshold {} of {}):", threshold, total_shares);
            println!("Master Public Key: {}", tkp.master_keypair.pk.to_hex());
            for share in tkp.shares {
                let hex_share = HexKeyShare::from_share(&share);
                let json = serde_json::to_string(&hex_share)?;
                println!("Share {}: {}", share.index, json);
            }
        }

        Commands::CombineThresholdShares { shares } => {
            let parsed_shares = shares.iter().map(|s| {
                let hex_share: HexKeyShare = serde_json::from_str(s)
                    .map_err(|e| anyhow!("Failed to parse share JSON: {}", e))?;
                hex_share.to_share()
                    .map_err(|e| anyhow!("Failed to decode share: {}", e))
            }).collect::<Result<Vec<_>>>()?;

            let recovered_sk = combine_shares(&parsed_shares)?;
            println!("Recovered Master Secret Key: {}", fr_to_hex(&recovered_sk));
        }

        Commands::CreateElection { url, admin_token, title, trustee_pk, start_time, end_time } => {
            let req = CreateElectionRequest {
                title,
                trustee_pk_hex: trustee_pk,
                start_time,
                end_time,
            };
            let res = client.post(format!("{}/api/v1/admin/election", url))
                .header("Authorization", format!("Bearer {}", admin_token))
                .json(&req)
                .send()
                .await?;
            if !res.status().is_success() {
                let err_text = res.text().await?;
                return Err(anyhow!("Failed to create election: {}", err_text));
            }
            let details: ElectionDetailsResponse = res.json().await?;
            println!("Election created successfully:");
            println!("ID: {}", details.id);
            println!("Title: {}", details.title);
            println!("Phase: {:?}", details.phase);
        }

        Commands::IssueCredentials { url, admin_token, count } => {
            let req = IssueCredentialsRequest { count };
            let res = client.post(format!("{}/api/v1/admin/credentials", url))
                .header("Authorization", format!("Bearer {}", admin_token))
                .json(&req)
                .send()
                .await?;
            if !res.status().is_success() {
                let err_text = res.text().await?;
                return Err(anyhow!("Failed to issue credentials: {}", err_text));
            }
            let resp: IssueCredentialsResponse = res.json().await?;
            println!("Successfully issued {} credentials:", resp.count_issued);
            println!("WARNING: {}", resp.warning);
            for (i, code) in resp.credentials.iter().enumerate() {
                println!("[{}] {}", i + 1, code);
            }
        }

        Commands::OpenVoting { url, admin_token } => {
            let res = client.post(format!("{}/api/v1/admin/open-voting", url))
                .header("Authorization", format!("Bearer {}", admin_token))
                .send()
                .await?;
            if !res.status().is_success() {
                let err_text = res.text().await?;
                return Err(anyhow!("Failed to open voting: {}", err_text));
            }
            let resp: OpenVotingResponse = res.json().await?;
            println!("Voting is now OPEN!");
            println!("Roll Commitment (SHA-256): {}", resp.roll_commitment_hex);
            println!("Voters Registered: {}", resp.credentials_issued);
        }

        Commands::CloseVoting { url, admin_token } => {
            let res = client.post(format!("{}/api/v1/admin/close-voting", url))
                .header("Authorization", format!("Bearer {}", admin_token))
                .send()
                .await?;
            if !res.status().is_success() {
                let err_text = res.text().await?;
                return Err(anyhow!("Failed to close voting: {}", err_text));
            }
            println!("Voting has been CLOSED. Phase is now Tallying.");
        }

        Commands::CastVote { url, credential_code, vote } => {
            if vote != 0 && vote != 1 {
                return Err(anyhow!("Vote must be 0 (No) or 1 (Yes)"));
            }

            // Step 1: Login
            let login_res = client.post(format!("{}/api/v1/voter/login", url))
                .json(&VoterLoginRequest { credential_code: credential_code.clone() })
                .send()
                .await?;
            if !login_res.status().is_success() {
                let err_text = login_res.text().await?;
                return Err(anyhow!("Voter login failed: {}", err_text));
            }
            let login: VoterLoginResponse = login_res.json().await?;

            // Step 2: Fetch election details to get trustee public key
            let election_res = client.get(format!("{}/api/v1/election", url)).send().await?;
            let election: ElectionDetailsResponse = election_res.json().await?;

            let trustee_pk = PublicKey::from_hex(&election.trustee_pk_hex)
                .map_err(|e| anyhow!("Failed to parse trustee public key: {}", e))?;

            // Step 3: Encrypt vote and generate range proof
            let mut rng = thread_rng();
            let r = Fr::rand(&mut rng);
            let ciphertext = encrypt_with_randomness(&trustee_pk, vote, &r);
            let range_proof = generate_range_proof(&trustee_pk, &ciphertext, vote, &r, &mut rng)
                .map_err(|e| anyhow!("Failed to generate range proof: {}", e))?;

            let nullifier = compute_nullifier(credential_code.as_bytes(), "default_election");

            let ballot_req = SubmitBallotRequest {
                nullifier_hex: hex::encode(nullifier),
                ciphertext: HexCiphertext::from_ciphertext(&ciphertext),
                range_proof: HexDisjunctiveRangeProof::from_proof(&range_proof),
            };

            // Step 4: Submit ballot
            let submit_res = client.post(format!("{}/api/v1/ballots", url))
                .header("Authorization", format!("Bearer {}", login.session_token))
                .json(&ballot_req)
                .send()
                .await?;
            if !submit_res.status().is_success() {
                let err_text = submit_res.text().await?;
                return Err(anyhow!("Ballot submission failed: {}", err_text));
            }
            let receipt: BallotReceiptResponse = submit_res.json().await?;
            println!("Ballot successfully cast and recorded on bulletin board!");
            println!("Sequence Number: {}", receipt.sequence_number);
            println!("Entry Hash:      {}", receipt.entry_hash);
            println!("Chain Head Hash: {}", receipt.chain_head_hash);
            println!("Nullifier:       {}", receipt.nullifier_hex);
        }

        Commands::TallyDecryptAndProve { url, admin_token, trustee_sk, max_bound } => {
            let tally_res = client.get(format!("{}/api/v1/tally", url)).send().await?;
            let tally: TallyCiphertextResponse = tally_res.json().await?;

            let sk = voting_crypto::fr_from_hex(&trustee_sk)
                .context("Failed to parse trustee secret key")?;
            let pk = PublicKey::new(G1Projective::generator() * sk);

            let hex_ct = HexCiphertext { c1_hex: tally.c1_hex, c2_hex: tally.c2_hex };
            let ct = hex_ct.to_ciphertext().map_err(|e| anyhow!("Failed to decode tally ciphertext: {}", e))?;

            println!("Decrypting homomorphic sum for {} ballots...", tally.total_ballots);
            let decrypted_point = ct.c2 - (ct.c1 * sk);
            let tally_result = solve_discrete_log(&decrypted_point, max_bound)
                .map_err(|e| anyhow!("Failed to solve discrete logarithm within bound {}: {}", max_bound, e))?;
            println!("Decrypted Tally: {}", tally_result);

            let mut rng = thread_rng();
            let proof = generate_decryption_proof(&sk, &pk, &ct, tally_result, &mut rng);
            let finalize_req = FinalizeTallyRequest {
                proof: HexChaumPedersenProof::from_proof(&proof),
            };

            let fin_res = client.post(format!("{}/api/v1/admin/finalize-tally", url))
                .header("Authorization", format!("Bearer {}", admin_token))
                .json(&finalize_req)
                .send()
                .await?;
            if !fin_res.status().is_success() {
                let err_text = fin_res.text().await?;
                return Err(anyhow!("Failed to finalize tally: {}", err_text));
            }
            let fin_resp: FinalizeTallyResponse = fin_res.json().await?;
            println!("Tally successfully finalized and proved!");
            println!("Final Phase: {:?}", fin_resp.phase);
            println!("Verified Final Tally: {}", fin_resp.final_tally);
        }

        Commands::TallyDecryptThresholdAndProve { url, admin_token, shares, max_bound } => {
            let parsed_shares = shares.iter().map(|s| {
                let hex_share: HexKeyShare = serde_json::from_str(s)
                    .map_err(|e| anyhow!("Failed to parse share JSON: {}", e))?;
                hex_share.to_share()
                    .map_err(|e| anyhow!("Failed to decode share: {}", e))
            }).collect::<Result<Vec<_>>>()?;

            let recovered_sk = combine_shares(&parsed_shares)?;
            let pk = PublicKey::new(G1Projective::generator() * recovered_sk);

            let tally_res = client.get(format!("{}/api/v1/tally", url)).send().await?;
            let tally: TallyCiphertextResponse = tally_res.json().await?;

            let hex_ct = HexCiphertext { c1_hex: tally.c1_hex, c2_hex: tally.c2_hex };
            let ct = hex_ct.to_ciphertext().map_err(|e| anyhow!("Failed to decode tally ciphertext: {}", e))?;

            println!("Reconstructed master key from threshold shares. Solving tally...");
            let decrypted_point = ct.c2 - (ct.c1 * recovered_sk);
            let tally_result = solve_discrete_log(&decrypted_point, max_bound)
                .map_err(|e| anyhow!("Failed to solve discrete log: {}", e))?;
            println!("Decrypted Tally: {}", tally_result);

            let mut rng = thread_rng();
            let proof = generate_decryption_proof(&recovered_sk, &pk, &ct, tally_result, &mut rng);
            let finalize_req = FinalizeTallyRequest {
                proof: HexChaumPedersenProof::from_proof(&proof),
            };

            let fin_res = client.post(format!("{}/api/v1/admin/finalize-tally", url))
                .header("Authorization", format!("Bearer {}", admin_token))
                .json(&finalize_req)
                .send()
                .await?;
            if !fin_res.status().is_success() {
                let err_text = fin_res.text().await?;
                return Err(anyhow!("Failed to finalize tally: {}", err_text));
            }
            let fin_resp: FinalizeTallyResponse = fin_res.json().await?;
            println!("Tally successfully finalized and verified via threshold reconstruction!");
            println!("Final Tally: {}", fin_resp.final_tally);
        }

        Commands::Status { url } => {
            let res = client.get(format!("{}/api/v1/election", url)).send().await?;
            let details: ElectionDetailsResponse = res.json().await?;
            println!("========================================");
            println!("Election:               {}", details.title);
            println!("Phase:                  {:?}", details.phase);
            println!("Trustee Public Key:     {}", details.trustee_pk_hex);
            println!("Credentials Issued:     {}", details.credentials_issued_count);
            println!("Credentials Used:       {}", details.credentials_used_count);
            println!("Ballots in Bulletin:    {}", details.ballots_in_log_count);
            println!("Chain Head Hash:        {}", details.chain_head_hash);
            if let Some(tally) = details.final_tally {
                println!("Final Tally:            {} (Proof Verified: {})", tally, details.proof_verified);
            }
            println!("========================================");
        }

        Commands::Verify { url } => {
            println!("Auditing election from server {}...", url);
            let election_res = client.get(format!("{}/api/v1/election", url)).send().await?;
            let election: ElectionDetailsResponse = election_res.json().await?;

            let bulletin_res = client.get(format!("{}/api/v1/bulletin", url)).send().await?;
            let bulletin: BulletinLogResponse = bulletin_res.json().await?;

            let tally_res = client.get(format!("{}/api/v1/tally", url)).send().await?;
            let tally: TallyCiphertextResponse = tally_res.json().await?;

            let report = verifier::audit_bulletin_and_tally(
                &election,
                &bulletin,
                &tally,
                None,
            )?;

            println!("============================================================");
            println!("INDEPENDENT BULLETIN BOARD AUDIT CERTIFICATE");
            println!("============================================================");
            println!("Election Title:           {}", election.title);
            println!("Election Phase:           {:?}", election.phase);
            println!("Total Ballots Audited:    {}", report.total_ballots);
            println!("Hash Chain Continuity:    VALID (SHA-256 chain intact from genesis)");
            println!("ZK Range Proofs:          VALID (All ballots mathematically proven 0 or 1)");
            println!("Homomorphic Sum:          MATCHES SERVER TALLY CIPHERTEXT");
            if let Some(tally) = report.final_tally {
                println!("Final Verified Tally:     {}", tally);
            }
            println!("============================================================");
            println!("AUDIT RESULT: VERIFIED PASS (Zero discrepancies detected)");
            println!("============================================================");
        }
    }

    Ok(())
}
