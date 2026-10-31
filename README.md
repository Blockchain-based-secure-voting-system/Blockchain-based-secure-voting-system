# Decentralized Electronic Voting System on Internet Computer Protocol (ICP)

A production-quality, privacy-preserving, zero-knowledge electronic voting system built on the **Internet Computer Protocol (ICP)** using Rust, Candid, **BN254 ElGamal Homomorphic Encryption**, per-voter nullifiers, **1-out-of-2 Disjunctive Chaum-Pedersen Ballot Range Proofs**, **Shamir Secret Sharing (n-of-m) Threshold Custody**, and **Chaum-Pedersen Decryption Zero-Knowledge Proofs (NIZK DLEQ)**.

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
                                  |  - ZK Proof: Chaum-Pedersen DLEQ via Fiat-Shamir      |
                                  +---------------------------+---------------------------+
                                                              |
                                                              | ic-agent (Candid RPC)
                                                              v
+-------------------------------------------------------------------------------------------------------------------+
|                                            ICP CANISTER SMART CONTRACT                                            |
|                                                                                                                   |
|  Lifecycle Phases: Setup -------------------> Voting -------------------> Tallying -------------------> Complete   |
|                    (Register Voters)        (Cast Ballots)              (Submit ZK Proof)           (Final Results) |
|                                                                                                                   |
|  State Machine & Security Enforcement:                                                                            |
|   1. Phase & Timestamp Validation                                                                                 |
|   2. Caller Principal Eligibility (Internet Identity)                                                             |
|   3. Nullifier Uniqueness Check (Prevents Double-Voting)                                                             |
|   4. BN254 G1 Curve-Membership Point Validation                                                                   |
|   5. 1-out-of-2 Disjunctive Chaum-Pedersen ZK Range Proof Verification (Ensures m in {0,1})                       |
|   6. Homomorphic Tally Accumulation: C_sum = sum(C_i)                                                            |
|   7. On-Chain Chaum-Pedersen ZK Decryption Proof Verification                                                    |
|   8. Pre/Post-Upgrade Hooks for ICP Stable Memory Persistence                                                     |
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
- **Threshold Scheme**: $n$-of-$m$ polynomial Shamir Secret Sharing over scalar field $\mathbb{F}_q$.
- **Polynomial**: $f(x) = sk + a_1 x + a_2 x^2 + \dots + a_{n-1} x^{n-1} \pmod q$.
- **Lagrange Interpolation**: Any $n$ trustee shares $(i, f(i))$ compute Lagrange basis coefficients $\lambda_i = \prod_{j \neq i} \frac{-x_j}{x_i - x_j} \pmod q$ to reconstruct $sk = \sum_{i=1}^n \lambda_i f(i) \pmod q$ or combine partial decryption factors $W = \sum_{i=1}^n \lambda_i W_i = sk \cdot C_1$.

### 4. 1-out-of-2 Disjunctive Chaum-Pedersen Range Proof (Ballot Validity)
To prevent malicious voters from encrypting out-of-range scalars ($m > 1$ or negative values):
- **Statement**: Prove that $m \in \{0, 1\}$ for ciphertext $C = (r \cdot G, r \cdot PK + m \cdot G)$ without revealing $m$.
- **Branch 0 ($m=0$)**: $(C_1, C_2) = (r \cdot G, r \cdot PK)$
- **Branch 1 ($m=1$)**: $(C_1, C_2 - G) = (r \cdot G, r \cdot PK)$
- **Fiat-Shamir Joint Challenge**:
  $$c = \text{Keccak256}(\text{"DISJUNCTIVE_RANGE_PROOF_BN254_V1"} \parallel G \parallel PK \parallel C_1 \parallel C_2 \parallel a_0 \parallel b_0 \parallel a_1 \parallel b_1) \pmod q$$
- **Verification Equations (On-Chain Canister)**:
  $$c_0 + c_1 \stackrel{?}{=} c, \qquad s_0 \cdot G \stackrel{?}{=} a_0 + c_0 \cdot C_1, \qquad s_0 \cdot PK \stackrel{?}{=} b_0 + c_0 \cdot C_2$$
  $$s_1 \cdot G \stackrel{?}{=} a_1 + c_1 \cdot C_1, \qquad s_1 \cdot PK \stackrel{?}{=} b_1 + c_1 \cdot (C_2 - G)$$

### 5. Chaum-Pedersen Zero-Knowledge Decryption Proof (NIZK DLEQ)
- **Statement**: Trustee proves knowledge of $sk$ such that $PK = sk \cdot G$ and $W = sk \cdot C_{1,\text{sum}}$.
- **Commitment**: $A = k \cdot G$, $B = k \cdot C_{1,\text{sum}}$.
- **Fiat-Shamir Challenge**:
  $$c = \text{Keccak256}(\text{"CHAUM_PEDERSEN_BN254_V1"} \parallel G \parallel PK \parallel C_{1,\text{sum}} \parallel W \parallel A \parallel B) \pmod q$$
- **Verification Equations (On-Chain Canister)**:
  $$s \cdot G \stackrel{?}{=} A + c \cdot PK, \qquad s \cdot C_{1,\text{sum}} \stackrel{?}{=} B + c \cdot W, \qquad C_{2,\text{sum}} - W \stackrel{?}{=} M_{\text{total}} \cdot G$$

### 6. Nullifier & Double-Voting Prevention
- Each ballot includes a deterministic 32-byte nullifier:
  $$\text{nullifier} = \text{Keccak256}(\text{"VOTING_NULLIFIER_V1"} \parallel \text{voter_secret} \parallel \text{election_id})$$
- Recorded in canister stable memory (`BTreeSet<[u8; 32]>`). Replayed nullifiers are rejected with `Double-vote detected`.

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

### 1. Run Pre-Push Verification Gate
```bash
# Linux/macOS
./scripts/pre-push-check.sh

# Windows PowerShell
.\scripts\pre-push-check.ps1
```

### 2. Run Unit & Cryptographic Test Suite
```bash
cargo test --package voting_crypto --package cli --locked
```

### 3. Build Wasm Canister & CLI Binary
```bash
cargo build --package canister --target wasm32-unknown-unknown --release --locked
cargo build --package cli --release --locked
```

### 4. Build & Test Web Frontend (React + Vite + TypeScript)
```bash
cd frontend
npm install
npm test        # Runs Vitest Candid & IDL interface test suite
npm run build   # Production TypeScript & Vite bundle compilation
npm run dev     # Start local development server on http://localhost:3000
```

---

## 💻 Local ICP Deployment (WSL2) & Mock Election Walkthrough

*Historical Verification Note*: In earlier phases of this project on the Windows ARM64 host, all `dfx`-dependent verification ran exclusively inside GitHub Actions Ubuntu runners. With WSL2 (`Ubuntu` on `aarch64`) and `dfx 0.29.0` installed on the WSL-native ext4 filesystem (`/home/akhil/voting`), local replica and asset canister deployment can also be run directly via WSL2. Note that `dfx start --background` in WSL2 is tied to the lifetime of the originating Linux session unless kept open in an interactive terminal or detached via `setsid`.

```bash
# 1. Start Local Replica (use dfx 0.29.0 on WSL2 aarch64)
dfx start --background --clean

# 2. Deploy Backend & Frontend Asset Canisters
dfx deploy

# 3A. Generate Single Trustee Key
cargo run -p cli -- keygen

# 3B. OR Generate n-of-m Threshold Trustee Keys (e.g., 3-of-5)
cargo run -p cli -- keygen-threshold --threshold 3 --total-shares 5

# 4. Create Election
cargo run -p cli -- create-election --canister-id "<CANISTER_ID>" --title "2026 Referendum" --trustee-pk "<MASTER_PK>"

# 5. Register Voters
cargo run -p cli -- register-voters --canister-id "<CANISTER_ID>" --voters "2vxsx-fae"

# 6. Open Voting
cargo run -p cli -- open-voting --canister-id "<CANISTER_ID>"

# 7. Cast Encrypted Ballots (Generates & Verifies ZK Range Proof On-Chain)
cargo run -p cli -- cast-vote --canister-id "<CANISTER_ID>" --trustee-pk "<MASTER_PK>" --voter-secret "secret_1" --election-id "ref_2026" --vote 1

# 8. Close Voting
cargo run -p cli -- close-voting --canister-id "<CANISTER_ID>"

# 9. Tally Decryption via 3 Threshold Shares
cargo run -p cli -- tally-decrypt-threshold-and-prove --canister-id "<CANISTER_ID>" --shares "1:0x...,3:0x...,5:0x..."
```

---

## ⚠️ Security Limitations & Architectural Roadmap

1. **Ballot Range Validation [RESOLVED IN v0.2.0]**:
   - Every ballot is verified on-chain via a **1-out-of-2 Disjunctive Chaum-Pedersen Zero-Knowledge Range Proof**. Ballots not strictly encoding 0 or 1 are rejected.

2. **Trustee Key Custody [INTERIM SHAMIR THRESHOLD RESOLVED IN v0.3.0]**:
   - *Implemented Interim Scheme*: $n$-of-$m$ Shamir's Secret Sharing over scalar field $\mathbb{F}_q$. A trusted dealer setup (`cli keygen-threshold`) generates master public key $PK$ and $m$ threshold key shares. Any $n$ trustee shares can reconstruct $sk$ or combine partial decryption factors $W = \sum \lambda_i W_i = sk \cdot C_1$ via Lagrange interpolation.
   - *Emergency Key Recovery Notice*: The `combine-threshold-shares` command reconstructs $sk$ in single-process memory. It prints a prominent security warning banner and is intended strictly for emergency dealer recovery.
   - *Security Assumption*: Key generation uses a trusted dealer setup. In production deployments, this should be replaced with a non-interactive Distributed Key Generation (DKG) protocol or ICP native `vetKeys` to eliminate the setup dealer centralization point.

3. **Coercion & Vote-Selling [OUT OF SCOPE]**:
   - System does not prevent coercion. A voter can prove their vote by revealing randomness $r$.

4. **Client-Side Device Compromise [OUT OF SCOPE]**:
   - Malware on a voter's machine altering votes before encryption cannot be solved on-chain.

5. **Cryptographic Randomness**:
   - Client-side encryption relies on OS CSPRNG (`rand::thread_rng()`).
