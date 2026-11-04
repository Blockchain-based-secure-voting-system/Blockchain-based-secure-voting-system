# Zero-Knowledge Electronic Voting System (Axum + PostgreSQL & React WASM)

A production-quality, privacy-preserving, zero-knowledge electronic voting system built with a **Rust Axum + PostgreSQL** backend (deployed on Render) and a **React + TypeScript + WebAssembly** frontend (deployed on Vercel), featuring **BN254 ElGamal Homomorphic Encryption**, per-voter nullifiers, **1-out-of-2 Disjunctive Chaum-Pedersen Ballot Range Proofs**, **Shamir Secret Sharing (n-of-m) Threshold Custody**, and **Chaum-Pedersen Decryption Zero-Knowledge Proofs (NIZK DLEQ)**.

---

## 🏛️ System Architecture

```
                                  +-------------------------------------------------------+
                                  |                  RUST CLI CLIENT                      |
                                  |  - KeyGen: Single Keypair & n-of-m Shamir Threshold   |
                                  |  - Vote Encryption: C = (r*G, r*PK + m*G)             |
                                  |  - ZK Range Proof: 1-out-of-2 Disjunctive (m in {0,1})|
                                  |  - Nullifier: Keccak256(secret || election_id)        |
                                  |  - Tally Decryption: BSGS & Lagrange Interpolation    |
                                  |  - Independent Audit: Verify bulletin board & proofs  |
                                  +---------------------------+---------------------------+
                                                              |
                                                              | REST / JSON API (reqwest)
                                                              v
+-------------------------------------------------------------------------------------------------------------------+
|                                        AXUM REST API + POSTGRESQL BACKEND                                         |
|                                                                                                                   |
|  Lifecycle Phases: Setup -------------------> Voting -------------------> Tallying -------------------> Complete   |
|                    (Register Voters)        (Cast Ballots)              (Submit ZK Proof)           (Final Results) |
|                                                                                                                   |
|  State Machine & Security Enforcement:                                                                            |
|   1. Phase & Server-Clock Timestamp Validation                                                                    |
|   2. Bearer Authentication & Single-Use Credential Code Authorization                                             |
|   3. Unique Nullifier Constraint (Database-enforced double-vote rejection)                                        |
|   4. BN254 G1 Curve-Membership Point Validation                                                                   |
|   5. 1-out-of-2 Disjunctive Chaum-Pedersen ZK Range Proof Verification (Ensures m in {0,1})                       |
|   6. Homomorphic Tally Accumulation: C_sum = sum(C_i)                                                            |
|   7. Cryptographic Decryption Proof Verification via Chaum-Pedersen DLEQ                                          |
|   8. Database Append-Only Bulletin Board Trigger (trg_bulletin_append_only blocks UPDATE & DELETE)                |
+-------------------------------------------------------------------------------------------------------------------+
```

---

## 📐 Cryptographic Design Specification

### 1. Elliptic Curve & Group Choice
- **Curve**: BN254 ($G_1$ prime order subgroup, order $r \approx 2.18 \times 10^{75}$).
- **Generator**: $G \in \mathbb{G}_1$.
- **Libraries**: `ark-bn254`, `ark-ec`, `ark-ff`, `ark-serialize` (pure Rust, compiles to `wasm32-unknown-unknown`).

### 2. Homomorphic Exponential ElGamal Encryption
- **Trustee Keypair**: Secret key $sk \xleftarrow{\$} \mathbb{F}_q$, Public Key $PK = sk \cdot G \in \mathbb{G}_1$.
- **Ballot Encryption**: For vote scalar $m \in \{0, 1\}$ and fresh randomness $r \xleftarrow{\$} \mathbb{F}_q$:
  $$C = (C_1, C_2) = (r \cdot G, \; r \cdot PK + m \cdot G)$$
- **Homomorphic Addition**: Given $N$ ciphertexts $C^{(i)} = (C_1^{(i)}, C_2^{(i)})$:
  $$C_{\text{sum}} = (C_{1,\text{sum}}, C_{2,\text{sum}}) = \left( \sum_{i=1}^N C_1^{(i)}, \; \sum_{i=1}^N C_2^{(i)} \right) = \left( \left(\sum r_i\right) \cdot G, \; \left(\sum r_i\right) \cdot PK + \left(\sum m_i\right) \cdot G \right)$$
- **Decryption**: Trustee computes decryption factor $W = sk \cdot C_{1,\text{sum}}$, then subtracts $W$ from $C_{2,\text{sum}}$:
  $$D = C_{2,\text{sum}} - W = \left(\sum m_i\right) \cdot G = M_{\text{total}} \cdot G$$
- **Discrete Log Solver**: $M_{\text{total}}$ is recovered from $D = M_{\text{total}} \cdot G$ using the **Baby-Step Giant-Step (BSGS)** algorithm in $O(\sqrt{M})$ time.

### 3. Threshold Key Custody (n-of-m Shamir Secret Sharing)
- **Threshold Scheme**: $nn\$-of-\$ polynomial Shamir Secret Sharing over scalar field $\mathbb{F}_q$.
- **Polynomial**: $f(x) = sk + a_1 x + a_2 x^2 + \dots + a_{n-1} x^{n-1} \pmod q$.
- **Lagrange Interpolation**: Any $n$ trustee shares $(i, f(i))$ compute Lagrange basis coefficients $\lambda_i = \prod_{j \neq i} \frac{-x_j}{x_i - x_j} \pmod q$ to reconstruct $sk = \sum_{i=1}^n \lambda_i f(i) \pmod q$ or combine partial decryption factors $W = \sum_{i=1}^n \lambda_i W_i = sk \cdot C_1$.

### 4. 1-out-of-2 Disjunctive Chaum-Pedersen Range Proof (Ballot Validity)
To prevent malicious voters from encrypting out-of-range scalars ($m > 1$ or negative values):
- **Statement**: Prove that $m \in \{0, 1\}$ for ciphertext $C = (r \cdot G, r \cdot PK + m \cdot G)$ without revealing $m$.
- **Branch 0 ($m=0$)**: $(C_1, C_2) = (r \cdot G, r \cdot PK)$
- **Branch 1 ($m=1$)**: $(C_1, C_2 - G) = (r \cdot G, r \cdot PK)$
- **Fiat-Shamir Joint Challenge**:
  $$c = \text{Keccak256}(\text{"DISJUNCTIVE_RANGE_PROOF_BN254_V1"} \parallel G \parallel PK \parallel C_1 \parallel C_2 \parallel a_0 \parallel b_0 \parallel a_1 \parallel b_1) \pmod q$$
- **Verification Equations (Server API)**:
  $$c_0 + c_1 \stackrel{?}{=} c, \qquad s_0 \cdot G \stackrel{?}{=} a_0 + c_0 \cdot C_1, \qquad s_0 \cdot PK \stackrel{?}{=} b_0 + c_0 \cdot C_2$$
  $$s_1 \cdot G \stackrel{?}{=} a_1 + c_1 \cdot C_1, \qquad s_1 \cdot PK \stackrel{?}{=} b_1 + c_1 \cdot (C_2 - G)$$

### 5. Chaum-Pedersen Zero-Knowledge Decryption Proof (NIZK DLEQ)
- **Statement**: Trustee proves knowledge of $sk$ such that $PK = sk \cdot G$ and $W = sk \cdot C_{1,\text{sum}}$.
- **Commitment**: $A = k \cdot G$, $B = k \cdot C_{1,\text{sum}}$.
- **Fiat-Shamir Challenge**:
  $$c = \text{Keccak256}(\text{"CHAUM_PEDERSEN_BN254_V1"} \parallel G \parallel PK \parallel C_{1,\text{sum}} \parallel W \parallel A \parallel B) \pmod q$$
- **Verification Equations (Server API)**:
  $$s \cdot G \stackrel{?}{=} A + c \cdot PK, \qquad s \cdot C_{1,\text{sum}} \stackrel{?}{=} B + c \cdot W, \qquad C_{2,\text{sum}} - W \stackrel{?}{=} M_{\text{total}} \cdot G$$

### 6. Nullifier & Double-Voting Prevention
- Each ballot includes a deterministic 32-byte nullifier:
  $$\text{nullifier} = \text{Keccak256}(\text{"VOTING_NULLIFIER_V1"} \parallel \text{voter_secret} \parallel \text{election_id})$$
- Recorded in PostgreSQL database table with unique constraint (`UNIQUE(election_id, nullifier)`). Replayed nullifiers are rejected with `Double-vote detected`.

---

## 🔒 Trust Model & Security Considerations

This system operates on a centralized Axum + PostgreSQL backend paired with client-side WebAssembly zero-knowledge cryptography:
1. **Operator Authority & Manipulation Capabilities**:
   - **Credential Issuance & Ballot Stuffing**: The centralized server operator controls voter eligibility and credential code generation. Because the operator generates credential codes, **the operator can issue extra credentials to stuff ballots**.
   - **Ballot Dropping & Censorship**: The operator controls the bulletin board ingestion endpoint and **can drop or refuse ballots**. Dropping cast ballots is **partially detectable via the hash-chain** if individual voters retain their signed sequence receipts and compare them against the public bulletin board.
   - **Phase Transitions & Availability**: The operator unilaterally triggers election lifecycle phase transitions (`Setup` -> `Voting` -> `Tallying` -> `Complete`) and controls server uptime/connectivity.
2. **Individual Ballot Privacy & Trustee Custody**:
   - Plaintext votes never traverse the network. Ballots are encrypted client-side in browser WebAssembly using BN254 Exponential ElGamal.
   - **Individual ballot privacy depends entirely on who holds the trustee private key**.
     - If a single entity holds the trustee private key ($sk$), that entity (or an operator in collusion with them) can decrypt individual voter ciphertexts.
     - Under $n$-of-$m$ Shamir threshold key custody, at least $n$ threshold trustees must collude to decrypt any individual ballot or the tally.
3. **Public Mathematical Verifiability**:
   - Every cast ballot includes a non-interactive 1-out-of-2 Disjunctive Chaum-Pedersen zero-knowledge range proof that the encrypted scalar is strictly 0 or 1 without revealing the vote.
   - The bulletin board hash-chain (`prev_hash` integrity links) and homomorphic tally summation are independently auditable by public observers using the CLI (`cargo run -p cli -- verify`).
   - The final tally decryption factor is accompanied by a Chaum-Pedersen DLEQ zero-knowledge proof verified against the trustee public key.
4. **Audit Status**:
   - This codebase is an unaudited reference implementation and must not be used for binding public elections without an independent security and cryptographic audit.

---

## ⏳ Render Free-Tier Limitations & 30-Day Database Expiry

- **Cold Starts ("Server is waking up")**: On Render's free tier, backend web services spin down after 15 minutes of inactivity. The first incoming request initiates a container cold start taking ~30-60 seconds. The web interface displays a **"Server is waking up"** indicator during this interval.
- **30-Day PostgreSQL Expiry**: Free-tier PostgreSQL databases on Render automatically expire and are deleted 30 days after creation.
- **Data Export Tool**: Before database expiration, administrators must archive election artifacts using the export script:
  ```bash
  ./scripts/export_election_data.sh https://voting-system-api-wi7q.onrender.com ./exports
  ```
  This produces a portable JSON snapshot (`election_export_<timestamp>.json`) containing the election metadata, full bulletin log with hash chain, and encrypted tally.

---

## 🛠️ Prerequisites & Installation

```bash
# Add Wasm target
rustup target add wasm32-unknown-unknown

# Wire Git Pre-Push Hook Gate
git config core.hooksPath .githooks
```

*Note for Windows ARM64 Environments without MSVC `link.exe`*: The local pre-push hook detects missing native MSVC build tools and defers host binary linking verification to the pinned GitHub Actions CI workflow (`ubuntu-latest`).

---

## 🚀 Building & Testing

### 1. Run Unit & Cryptographic Test Suite
```bash
cargo test --package voting_crypto --package election_core --package cli --locked
```

### 2. Run Server Integration Tests (Axum + PostgreSQL)
```bash
# Set your PostgreSQL test database URL
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/voting_test"
cargo test --package server --test server_tests -- --test-threads=1
```

### 3. Build Web Frontend (React + Vite + TypeScript + WASM)
```bash
cd frontend
npm ci
npm test        # Runs Vitest unit & component security suite
npm run build   # Production bundle compilation into dist/
npm run dev     # Start local development server on http://localhost:3000
```

### 4. Run Playwright E2E & Accessibility Suite
```bash
cd frontend
npm run build:e2e
npx playwright test
```

---

## 💻 Local Axum + PostgreSQL Deployment & CLI Walkthrough

```bash
# 1. Run PostgreSQL locally or via Docker
docker run -d --name voting-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=voting -p 5432:5432 postgres:16

# 2. Run Database Migrations and Start Axum Server
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/voting"
export ADMIN_TOKEN="your_secure_admin_token"
export BIND_ADDR="127.0.0.1:8080"
cargo run -p server

# 3A. Generate Single Trustee Keypair
cargo run -p cli -- keygen

# 3B. OR Generate n-of-m Shamir Threshold Trustee Keys (e.g., 3-of-5)
cargo run -p cli -- keygen-threshold --threshold 3 --total-shares 5

# 4. Create Election
cargo run -p cli -- create-election --api-url "http://127.0.0.1:8080" --admin-token "$ADMIN_TOKEN" --title "2026 Referendum" --trustee-pk "<MASTER_PK>"

# 5. Register Voters or Issue Single-Use Credential Codes
cargo run -p cli -- register-voters --api-url "http://127.0.0.1:8080" --admin-token "$ADMIN_TOKEN" --voters "voter_1,voter_2"

# 6. Open Voting
cargo run -p cli -- open-voting --api-url "http://127.0.0.1:8080" --admin-token "$ADMIN_TOKEN"

# 7. Cast Encrypted Ballot (ZK Range Proof Verified by Server)
cargo run -p cli -- cast-vote --api-url "http://127.0.0.1:8080" --trustee-pk "<MASTER_PK>" --voter-secret "secret_1" --election-id "<ELECTION_ID>" --vote 1

# 8. Close Voting
cargo run -p cli -- close-voting --api-url "http://127.0.0.1:8080" --admin-token "$ADMIN_TOKEN"

# 9. Tally Decryption via 3 Threshold Shares
cargo run -p cli -- tally-decrypt-threshold-and-prove --api-url "http://127.0.0.1:8080" --election-id "<ELECTION_ID>" --shares "1:0x...,3:0x...,5:0x..."

# 10. Independent Bulletin Board Audit
cargo run -p cli -- audit --api-url "http://127.0.0.1:8080" --election-id "<ELECTION_ID>"
```

---


