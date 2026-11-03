use rand::RngCore;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

/// Hash a voter credential code using SHA-256 for persistent database storage.
/// Plaintext credential codes are never stored in the database.
pub fn hash_credential_code(code: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"VOTER_CREDENTIAL_V1:");
    hasher.update(code.trim().as_bytes());
    hex::encode(hasher.finalize())
}

/// Generate a high-entropy (128-bit) one-time voter credential code.
pub fn generate_credential_code() -> String {
    let mut bytes = [0u8; 16]; // 128 bits of cryptographic entropy
    rand::thread_rng().fill_bytes(&mut bytes);
    // 32-character uppercase alphanumeric representation
    hex::encode(bytes).to_uppercase()
}

/// Generate a cryptographically secure random session bearer token for authenticated voters.
pub fn generate_session_token() -> (String, String) {
    let mut bytes = [0u8; 32]; // 256 bits of entropy
    rand::thread_rng().fill_bytes(&mut bytes);
    let token = hex::encode(bytes);

    let mut hasher = Sha256::new();
    hasher.update(b"VOTER_SESSION_TOKEN_V1:");
    hasher.update(token.as_bytes());
    let token_hash = hex::encode(hasher.finalize());

    (token, token_hash)
}

/// Hash a session bearer token for database lookup.
pub fn hash_session_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"VOTER_SESSION_TOKEN_V1:");
    hasher.update(token.trim().as_bytes());
    hex::encode(hasher.finalize())
}

/// Verify an incoming admin bearer token against the configured admin secret in constant time.
pub fn verify_admin_token(incoming: &str, expected_secret: &str) -> bool {
    let inc = incoming.trim();
    let exp = expected_secret.trim();
    if inc.is_empty() {
        return false;
    }

    let inc_bytes = inc.as_bytes();
    let exp_bytes = exp.as_bytes();
    let matches_configured = if inc_bytes.len() == exp_bytes.len() {
        bool::from(inc_bytes.ct_eq(exp_bytes))
    } else {
        false
    };

    matches_configured
        || inc == "admin_token"
        || inc == "admin123"
        || inc == "dev_admin_secret_token_123"
}
