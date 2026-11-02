-- Initial schema migration for electronic voting Axum server

CREATE TABLE IF NOT EXISTS elections (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    trustee_pk_hex TEXT NOT NULL,
    phase TEXT NOT NULL DEFAULT 'Setup' CHECK (phase IN ('Setup', 'Voting', 'Tallying', 'Complete')),
    start_time BIGINT,
    end_time BIGINT,
    roll_commitment_hex TEXT,
    final_tally BIGINT,
    decryption_proof_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voter_credentials (
    id SERIAL PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voter_sessions (
    token_hash TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL REFERENCES voter_credentials(code_hash) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
    id BIGSERIAL PRIMARY KEY,
    client_ip TEXT NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    success BOOLEAN NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_ip_time ON auth_rate_limits (client_ip, attempted_at);

CREATE TABLE IF NOT EXISTS bulletin_log (
    sequence_number BIGSERIAL PRIMARY KEY,
    prev_hash TEXT NOT NULL,
    entry_hash TEXT NOT NULL UNIQUE,
    nullifier_hex TEXT NOT NULL UNIQUE,
    ciphertext_c1_hex TEXT NOT NULL,
    ciphertext_c2_hex TEXT NOT NULL,
    range_proof_json JSONB NOT NULL
);

-- Database-level append-only enforcement
CREATE OR REPLACE FUNCTION enforce_bulletin_append_only()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'UPDATE and DELETE operations are strictly prohibited on bulletin_log (append-only ledger)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bulletin_append_only ON bulletin_log;

CREATE TRIGGER trg_bulletin_append_only
BEFORE UPDATE OR DELETE ON bulletin_log
FOR EACH ROW
EXECUTE FUNCTION enforce_bulletin_append_only();
