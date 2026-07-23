use anyhow::{anyhow, Context, Result};
use candid::{CandidType, Deserialize, Principal};
use clap::{Parser, Subcommand};
use ic_agent::identity::AnonymousIdentity;
use ic_agent::Agent;
use rand::thread_rng;
use std::str::FromStr;

use voting_crypto::{
    compute_nullifier, encrypt, fr_from_hex, fr_to_hex, generate_decryption_proof,
    generate_range_proof, g1_from_hex, solve_discrete_log, Ciphertext,
    HexChaumPedersenProof, HexCiphertext, HexDisjunctiveRangeProof, KeyPair, PublicKey,
};

// Types matching Canister Candid interface
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

#[derive(Parser)]
#[command(name = "voting-cli")]
#[command(about = "CLI tool for ICP BN254 ElGamal Zero-Knowledge Electronic Voting System", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Generate a new Trustee ElGamal KeyPair over BN254 G1
    Keygen,

    /// Create and initialize an election on the ICP canister
    CreateElection {
        #[arg(long, default_value = "http://127.0.0.1:4943")]
        url: String,

        #[arg(long)]
        canister_id: String,

        #[arg(long)]
        title: String,

        #[arg(long)]
        trustee_pk: String,

        #[arg(long, default_value = "0")]
        start_time: u64,

        #[arg(long, default_value = "0")]
        end_time: u64,
    },

    /// Register eligible voter principals on the canister
    RegisterVoters {
        #[arg(long, default_value = "http://127.0.0.1:4943")]
        url: String,

        #[arg(long)]
        canister_id: String,

        #[arg(long, value_delimiter = ',')]
        voters: Vec<String>,
    },

    /// Transition election phase to OPEN for voting
    OpenVoting {
        #[arg(long, default_value = "http://127.0.0.1:4943")]
        url: String,

        #[arg(long)]
        canister_id: String,
    },

    /// Encrypt vote (0 or 1), compute nullifier, generate ZK Range Proof, and submit ballot to canister
    CastVote {
        #[arg(long, default_value = "http://127.0.0.1:4943")]
        url: String,

        #[arg(long)]
        canister_id: String,

        #[arg(long)]
        trustee_pk: String,

        #[arg(long)]
        voter_secret: String,

        #[arg(long)]
        election_id: String,

        #[arg(long)]
        vote: u64,
    },

    /// Transition election phase to TALLYING to close voting
    CloseVoting {
        #[arg(long, default_value = "http://127.0.0.1:4943")]
        url: String,

        #[arg(long)]
        canister_id: String,
    },

    /// Trustee: fetch encrypted tally, decrypt via BSGS, generate Chaum-Pedersen ZK proof, and submit to canister
    TallyDecryptAndProve {
        #[arg(long, default_value = "http://127.0.0.1:4943")]
        url: String,

        #[arg(long)]
        canister_id: String,

        #[arg(long)]
        trustee_sk: String,

        #[arg(long, default_value = "1000000")]
        max_bound: u64,
    },

    /// Query current status of election from canister
    Status {
        #[arg(long, default_value = "http://127.0.0.1:4943")]
        url: String,

        #[arg(long)]
        canister_id: String,
    },
}

async fn build_agent(url: &str) -> Result<Agent> {
    let agent = Agent::builder()
        .with_url(url)
        .with_identity(AnonymousIdentity)
        .build()
        .context("Failed to build ic-agent")?;

    // Fetch root key for local network
    if url.contains("127.0.0.1") || url.contains("localhost") {
        agent
            .fetch_root_key()
            .await
            .context("Failed to fetch root key from local replica")?;
    }

    Ok(agent)
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Keygen => {
            let mut rng = thread_rng();
            let keypair = KeyPair::generate(&mut rng);
            let sk_hex = fr_to_hex(&keypair.sk);
            let pk_hex = keypair.pk.to_hex();

            println!("=== ElGamal KeyPair Generated (BN254 Curve) ===");
            println!("Trustee Secret Key (sk): {}", sk_hex);
            println!("Trustee Public Key (PK): {}", pk_hex);
            println!("\n[SECURITY WARNING]: Store trustee secret key in a secure vault. Never share sk.");
        }

        Commands::CreateElection {
            url,
            canister_id,
            title,
            trustee_pk,
            start_time,
            end_time,
        } => {
            let agent = build_agent(&url).await?;
            let canister_principal = Principal::from_text(&canister_id)?;

            let arg = candid::encode_args((title, trustee_pk, start_time, end_time))?;
            let res_bytes = agent
                .update(&canister_principal, "create_election")
                .with_arg(arg)
                .call_and_wait()
                .await?;

            let res: Result<String, String> = candid::decode_one(&res_bytes)?;
            match res {
                Ok(msg) => println!("Success: {}", msg),
                Err(err) => eprintln!("Canister Error: {}", err),
            }
        }

        Commands::RegisterVoters {
            url,
            canister_id,
            voters,
        } => {
            let agent = build_agent(&url).await?;
            let canister_principal = Principal::from_text(&canister_id)?;

            let voter_principals: Result<Vec<Principal>, _> =
                voters.iter().map(|s| Principal::from_str(s)).collect();
            let voter_principals = voter_principals.context("Invalid voter principal string")?;

            let arg = candid::encode_one(voter_principals)?;
            let res_bytes = agent
                .update(&canister_principal, "register_voters")
                .with_arg(arg)
                .call_and_wait()
                .await?;

            let res: Result<u64, String> = candid::decode_one(&res_bytes)?;
            match res {
                Ok(count) => println!("Successfully registered {} voters", count),
                Err(err) => eprintln!("Canister Error: {}", err),
            }
        }

        Commands::OpenVoting { url, canister_id } => {
            let agent = build_agent(&url).await?;
            let canister_principal = Principal::from_text(&canister_id)?;

            let res_bytes = agent
                .update(&canister_principal, "open_voting")
                .with_arg(candid::encode_args(())?)
                .call_and_wait()
                .await?;

            let res: Result<String, String> = candid::decode_one(&res_bytes)?;
            match res {
                Ok(msg) => println!("Success: {}", msg),
                Err(err) => eprintln!("Canister Error: {}", err),
            }
        }

        Commands::CastVote {
            url,
            canister_id,
            trustee_pk,
            voter_secret,
            election_id,
            vote,
        } => {
            if vote != 0 && vote != 1 {
                return Err(anyhow!("Vote must be either 0 or 1"));
            }

            let agent = build_agent(&url).await?;
            let canister_principal = Principal::from_text(&canister_id)?;

            let pk = PublicKey::from_hex(&trustee_pk)?;
            let mut rng = thread_rng();

            // 1. Encrypt vote into BN254 ElGamal Ciphertext
            let (ciphertext, r) = encrypt(&pk, vote, &mut rng);
            let hex_ct = HexCiphertext::from_ciphertext(&ciphertext);

            // 2. Generate 1-out-of-2 Disjunctive Chaum-Pedersen Zero-Knowledge Range Proof
            let range_proof = generate_range_proof(&pk, &ciphertext, vote, &r, &mut rng)
                .context("Failed to generate ZK range proof for ballot")?;
            let hex_range_proof = HexDisjunctiveRangeProof::from_proof(&range_proof);

            // 3. Compute voter nullifier
            let nullifier = compute_nullifier(voter_secret.as_bytes(), &election_id);

            let ballot = Ballot {
                nullifier: nullifier.to_vec(),
                ciphertext: hex_ct.clone(),
                range_proof: hex_range_proof,
            };

            // 4. Submit ballot to canister
            let arg = candid::encode_one(ballot)?;
            let res_bytes = agent
                .update(&canister_principal, "cast_ballot")
                .with_arg(arg)
                .call_and_wait()
                .await?;

            let res: Result<String, String> = candid::decode_one(&res_bytes)?;
            match res {
                Ok(msg) => {
                    println!("Ballot Cast & Verified Successfully!");
                    println!("Nullifier (hex): {}", hex::encode(nullifier));
                    println!("Encrypted Ballot (C1, C2):");
                    println!("  C1: {}", hex_ct.c1_hex);
                    println!("  C2: {}", hex_ct.c2_hex);
                    println!("ZK Ballot Range Proof (1-out-of-2): GENERATED & VERIFIED ON-CHAIN");
                    println!("Response: {}", msg);
                }
                Err(err) => eprintln!("Canister Error: {}", err),
            }
        }

        Commands::CloseVoting { url, canister_id } => {
            let agent = build_agent(&url).await?;
            let canister_principal = Principal::from_text(&canister_id)?;

            let res_bytes = agent
                .update(&canister_principal, "close_voting")
                .with_arg(candid::encode_args(())?)
                .call_and_wait()
                .await?;

            let res: Result<String, String> = candid::decode_one(&res_bytes)?;
            match res {
                Ok(msg) => println!("Success: {}", msg),
                Err(err) => eprintln!("Canister Error: {}", err),
            }
        }

        Commands::TallyDecryptAndProve {
            url,
            canister_id,
            trustee_sk,
            max_bound,
        } => {
            let agent = build_agent(&url).await?;
            let canister_principal = Principal::from_text(&canister_id)?;

            // 1. Fetch encrypted tally from canister
            let query_bytes = agent
                .query(&canister_principal, "get_encrypted_tally")
                .with_arg(candid::encode_args(())?)
                .call()
                .await?;

            let tally_res: Result<EncryptedTally, String> = candid::decode_one(&query_bytes)?;
            let enc_tally = tally_res.map_err(|e| anyhow!("Failed to fetch encrypted tally: {}", e))?;

            println!("Fetched Encrypted Tally Sum:");
            println!("  C1_sum: {}", enc_tally.c1_hex);
            println!("  C2_sum: {}", enc_tally.c2_hex);
            println!("  Total Ballots Cast: {}", enc_tally.total_ballots);

            let c1_sum = g1_from_hex(&enc_tally.c1_hex)?;
            let c2_sum = g1_from_hex(&enc_tally.c2_hex)?;
            let encrypted_sum = Ciphertext::new(c1_sum, c2_sum);

            let sk = fr_from_hex(&trustee_sk)?;
            let keypair = KeyPair::from_sk(sk);

            // 2. Decrypt tally point W = sk * C1_sum, D = C2_sum - W
            let w = c1_sum * sk;
            let decrypted_point = c2_sum - w;

            // 3. Solve discrete log using Baby-Step Giant-Step (BSGS)
            println!("Solving discrete log M * G = D using BSGS algorithm...");
            let tally = solve_discrete_log(&decrypted_point, max_bound)
                .context("Failed to solve discrete log for encrypted tally sum")?;

            println!("Decrypted Raw Tally Result: {} YES votes out of {} total ballots", tally, enc_tally.total_ballots);

            // 4. Generate Chaum-Pedersen Zero-Knowledge Proof
            println!("Generating Chaum-Pedersen Zero-Knowledge Proof of Decryption...");
            let mut rng = thread_rng();
            let proof = generate_decryption_proof(&sk, &keypair.pk, &encrypted_sum, tally, &mut rng);
            let hex_proof = HexChaumPedersenProof::from_proof(&proof);

            // 5. Submit proof to canister
            let arg = candid::encode_one(hex_proof)?;
            let res_bytes = agent
                .update(&canister_principal, "submit_decryption_proof")
                .with_arg(arg)
                .call_and_wait()
                .await?;

            let res: Result<u64, String> = candid::decode_one(&res_bytes)?;
            match res {
                Ok(verified_tally) => {
                    println!("\n=======================================================");
                    println!("ELECTION TALLY VERIFIED AND FINALIZED ON-CHAIN!");
                    println!("Verified Tally Result: {}", verified_tally);
                    println!("Zero-Knowledge Decryption Proof: VALIDATED BY CANISTER");
                    println!("=======================================================");
                }
                Err(err) => eprintln!("Canister Proof Rejection Error: {}", err),
            }
        }

        Commands::Status { url, canister_id } => {
            let agent = build_agent(&url).await?;
            let canister_principal = Principal::from_text(&canister_id)?;

            let query_bytes = agent
                .query(&canister_principal, "get_election_details")
                .with_arg(candid::encode_args(())?)
                .call()
                .await?;

            let details: ElectionDetails = candid::decode_one(&query_bytes)?;

            println!("=== Election Status ===");
            println!("Title: {}", details.title);
            println!("Admin: {}", details.admin);
            println!("Trustee Public Key: {}", details.trustee_pk_hex);
            println!("Phase: {:?}", details.phase);
            println!("Registered Voters: {}", details.registered_voters_count);
            println!("Total Ballots Cast: {}", details.total_ballots_cast);
            println!("Final Tally: {:?}", details.final_tally);
            println!("ZK Proof Verified: {}", details.proof_verified);
        }
    }

    Ok(())
}
