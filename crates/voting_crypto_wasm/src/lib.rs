use rand::thread_rng;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use voting_crypto::{
    combine_shares, compute_nullifier, encrypt, fr_from_hex, fr_to_hex, g1_from_hex,
    generate_decryption_proof, generate_range_proof, generate_threshold_keypair,
    solve_discrete_log, verify_range_proof, Ciphertext, HexChaumPedersenProof,
    HexCiphertext, HexDisjunctiveRangeProof, HexKeyShare, KeyPair, KeyShare, PublicKey,
};

#[derive(Serialize, Deserialize)]
pub struct WasmBallot {
    pub nullifier: Vec<u8>,
    pub ciphertext: HexCiphertext,
    pub range_proof: HexDisjunctiveRangeProof,
}

#[derive(Serialize, Deserialize)]
pub struct WasmDecryptionResult {
    pub decrypted_tally: u64,
    pub hex_proof: HexChaumPedersenProof,
}

#[derive(Serialize, Deserialize)]
pub struct WasmThresholdSetup {
    pub threshold: u64,
    pub total_shares: u64,
    pub master_pk_hex: String,
    pub shares: Vec<HexKeyShare>,
}

#[wasm_bindgen]
pub fn generate_voter_ballot(
    master_pk_hex: &str,
    voter_secret_hex: &str,
    election_id: &str,
    vote: u8,
) -> Result<JsValue, JsValue> {
    if vote > 1 {
        return Err(JsValue::from_str("Invalid ballot: vote must be 0 (NO) or 1 (YES)"));
    }

    let mut rng = thread_rng();

    let pk = PublicKey::from_hex(master_pk_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid master public key: {}", e)))?;

    let secret_bytes = hex::decode(voter_secret_hex.trim_start_matches("0x"))
        .unwrap_or_else(|_| voter_secret_hex.as_bytes().to_vec());

    let nullifier = compute_nullifier(&secret_bytes, election_id);

    let (ct, r) = encrypt(&pk, vote as u64, &mut rng);

    let range_proof = generate_range_proof(&pk, &ct, vote as u64, &r, &mut rng)
        .map_err(|e| JsValue::from_str(&format!("Failed to generate ZK range proof: {}", e)))?;

    let ballot = WasmBallot {
        nullifier: nullifier.to_vec(),
        ciphertext: HexCiphertext::from_ciphertext(&ct),
        range_proof: HexDisjunctiveRangeProof::from_proof(&range_proof),
    };

    serde_wasm_bindgen::to_value(&ballot)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen]
pub fn verify_ballot_range_proof(
    master_pk_hex: &str,
    c1_hex: &str,
    c2_hex: &str,
    range_proof_js: JsValue,
) -> Result<bool, JsValue> {
    let pk = PublicKey::from_hex(master_pk_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid master public key: {}", e)))?;

    let c1 = g1_from_hex(c1_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid C1 hex: {}", e)))?;
    let c2 = g1_from_hex(c2_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid C2 hex: {}", e)))?;
    let ct = Ciphertext::new(c1, c2);

    let hex_proof: HexDisjunctiveRangeProof = serde_wasm_bindgen::from_value(range_proof_js)
        .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))?;

    let proof = hex_proof.to_proof()
        .map_err(|e| JsValue::from_str(&format!("Invalid proof format: {}", e)))?;

    match verify_range_proof(&pk, &ct, &proof) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[wasm_bindgen]
pub fn generate_threshold_trustee_keys(
    threshold: u64,
    total_shares: u64,
) -> Result<JsValue, JsValue> {
    let mut rng = thread_rng();
    let tkp = generate_threshold_keypair(threshold, total_shares, &mut rng)
        .map_err(|e| JsValue::from_str(&format!("Failed to generate threshold keypair: {}", e)))?;

    let hex_shares: Vec<HexKeyShare> = tkp.shares.iter().map(HexKeyShare::from_share).collect();

    let setup = WasmThresholdSetup {
        threshold: tkp.threshold,
        total_shares: tkp.total_shares,
        master_pk_hex: tkp.master_keypair.pk.to_hex(),
        shares: hex_shares,
    };

    serde_wasm_bindgen::to_value(&setup)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen]
pub fn combine_threshold_shares_wasm(shares_js: JsValue) -> Result<String, JsValue> {
    let hex_shares: Vec<HexKeyShare> = serde_wasm_bindgen::from_value(shares_js)
        .map_err(|e| JsValue::from_str(&format!("Invalid shares input: {}", e)))?;

    let parsed_shares: Result<Vec<KeyShare>, _> = hex_shares
        .into_iter()
        .map(|s| s.to_share())
        .collect();

    let shares = parsed_shares
        .map_err(|e| JsValue::from_str(&format!("Failed to parse shares: {}", e)))?;

    let sk = combine_shares(&shares)
        .map_err(|e| JsValue::from_str(&format!("Failed to combine threshold shares: {}", e)))?;

    Ok(fr_to_hex(&sk))
}

#[wasm_bindgen]
pub fn decrypt_and_prove_tally_wasm(
    sk_hex: &str,
    c1_sum_hex: &str,
    c2_sum_hex: &str,
    max_bound: u64,
) -> Result<JsValue, JsValue> {
    let sk = fr_from_hex(sk_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid secret key hex: {}", e)))?;
    let keypair = KeyPair::from_sk(sk);

    let c1_sum = g1_from_hex(c1_sum_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid C1_sum hex: {}", e)))?;
    let c2_sum = g1_from_hex(c2_sum_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid C2_sum hex: {}", e)))?;
    let encrypted_sum = Ciphertext::new(c1_sum, c2_sum);

    let w = c1_sum * sk;
    let decrypted_point = c2_sum - w;

    let tally = solve_discrete_log(&decrypted_point, max_bound)
        .map_err(|e| JsValue::from_str(&format!("Failed to solve discrete log: {}", e)))?;

    let mut rng = thread_rng();
    let proof = generate_decryption_proof(&sk, &keypair.pk, &encrypted_sum, tally, &mut rng);
    let hex_proof = HexChaumPedersenProof::from_proof(&proof);

    let result = WasmDecryptionResult {
        decrypted_tally: tally,
        hex_proof,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}
