# Decentralized Electronic Voting System on Internet Computer Protocol (ICP)

A production-quality, privacy-preserving, zero-knowledge electronic voting system built on the **Internet Computer Protocol (ICP)** using Rust, Candid, **BN254 ElGamal Homomorphic Encryption**, per-voter nullifiers, **1-out-of-2 Disjunctive Chaum-Pedersen Ballot Range Proofs**, and **Chaum-Pedersen Decryption Zero-Knowledge Proofs (NIZK DLEQ)**.

---

## 🏛️ System Architecture

```
                                  +-------------------------------------------------------+
                                  |                  RUST CLI CLIENT                      |
                                  |  - ElGamal KeyGen (Trustee sk / PK on BN254)          |
                                  |  - Vote Encryption: C = (r*G, r*PK + m*G)             |
                                  |  - ZK Range Proof: 1-out-of-2 Disjunctive (m in {0,1})|
                                  |  - Nullifier: Keccak256(secret || election_id)        |
                                  |  - Tally Decryption: Baby-Step Giant-Step (BSGS)      |
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
|   3. Nullifier Uniqueness Check (Prevents Double-Voting)                                                          |
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

### 3. 1-out-of-2 Disjunctive Chaum-Pedersen Range Proof (Ballot Validity)
To prevent malicious voters from encrypting out-of-range scalars ($m > 1$ or negative values):
- **Statement**: Prove that $m \in \{0, 1\}$ for ciphertext $C = (r \cdot G, r \cdot PK + m \cdot G)$ without revealing $m$.
- **Branch 0 ($m=0$)**: $(C_1, C_2) = (r \cdot G, r \cdot PK)$
- **Branch 1 ($m=1$)**: $(C_1, C_2 - G) = (r \cdot G, r \cdot PK)$
- **Fiat-Shamir Joint Challenge**:
  $$c = \text{Keccak256}(\text{"DISJUNCTIVE_RANGE_PROOF_BN254_V1"} \parallel G \parallel PK \parallel C_1 \parallel C_2 \parallel a_0 \parallel b_0 \parallel a_1 \parallel b_1) \pmod q$$
- **Verification Equations (On-Chain Canister)**:
  $$c_0 + c_1 \stackrel{?}{=} c, \qquad s_0 \cdot G \stackrel{?}{=} a_0 + c_0 \cdot C_1, \qquad s_0 \cdot PK \stackrel{?}{=} b_0 + c_0 \cdot C_2$$
  $$s_1 \cdot G \stackrel{?}{=} a_1 + c_1 \cdot C_1, \qquad s_1 \cdot PK \stackrel{?}{=} b_1 + c_1 \cdot (C_2 - G)$$

### 4. Chaum-Pedersen Zero-Knowledge Decryption Proof (NIZK DLEQ)
- **Statement**: Trustee proves knowledge of $sk$ such that $PK = sk \cdot G$ and $W = sk \cdot C_{1,\text{sum}}$.
- **Commitment**: $A = k \cdot G$, $B = k \cdot C_{1,\text{sum}}$.
- **Fiat-Shamir Challenge**:
  $$c = \text{Keccak256}(\text{"CHAUM_PEDERSEN_BN254_V1"} \parallel G \parallel PK \parallel C_{1,\text{sum}} \parallel W \parallel A \parallel B) \pmod q$$
- **Verification Equations (On-Chain Canister)**:
  $$s \cdot G \stackrel{?}{=} A + c \cdot PK, \qquad s \cdot C_{1,\text{sum}} \stackrel{?}{=} B + c \cdot W, \qquad C_{2,\text{sum}} - W \stackrel{?}{=} M_{\text{total}} \cdot G$$

### 5. Nullifier & Double-Voting Prevention
- Each ballot includes a deterministic 32-byte nullifier:
  $$\text{nullifier} = \text{Keccak256}(\text{"VOTING_NULLIFIER_V1"} \parallel \text{voter_secret} \parallel \text{election_id})$$
- Recorded in canister stable memory (`BTreeSet<[u8; 32]>`). Replayed nullifiers are rejected with `Double-vote detected`.

---

## 🛠️ Prerequisites & Installation

```bash
# Add Wasm target
rustup target add wasm32-unknown-unknown
```

---

## 🚀 Building & Testing

### 1. Run Unit & Cryptographic Test Suite
```bash
cargo test --workspace
```

### 2. Build Wasm Canister & CLI Binary
```bash
cargo build --package canister --target wasm32-unknown-unknown --release
cargo build --package cli --release
```

---

## 💻 Local ICP Deployment & Mock Election Walkthrough

```bash
# 1. Start Local Replica
dfx start --background --clean

# 2. Deploy Canister
dfx deploy

# 3. Generate Trustee Keys
cargo run -p cli -- keygen

# 4. Create Election
cargo run -p cli -- create-election --canister-id "<CANISTER_ID>" --title "2026 Referendum" --trustee-pk "<TRUSTEE_PK>"

# 5. Register Voters
cargo run -p cli -- register-voters --canister-id "<CANISTER_ID>" --voters "2vxsx-fae,anonymous"

# 6. Open Voting
cargo run -p cli -- open-voting --canister-id "<CANISTER_ID>"

# 7. Cast Encrypted Ballots (Generates & Verifies ZK Range Proof On-Chain)
cargo run -p cli -- cast-vote --canister-id "<CANISTER_ID>" --trustee-pk "<TRUSTEE_PK>" --voter-secret "secret_1" --election-id "ref_2026" --vote 1

# 8. Close Voting
cargo run -p cli -- close-voting --canister-id "<CANISTER_ID>"

# 9. Trustee Tally Decryption & ZK Proof Submission
cargo run -p cli -- tally-decrypt-and-prove --canister-id "<CANISTER_ID>" --trustee-sk "<TRUSTEE_SK>"
```

---

## ⚠️ Security Limitations & Architectural Roadmap

1. **Ballot Range Validation [RESOLVED IN v0.2.0]**:
   - Every ballot is now verified on-chain via a **1-out-of-2 Disjunctive Chaum-Pedersen Zero-Knowledge Range Proof**. Ballots not strictly encoding 0 or 1 are rejected.

2. **Trustee Key Custody (Single Trustee vs. Threshold ElGamal / vetKeys)**:
   - *Current Implementation*: Single trustee keypair.
   - *Interim Threshold Design*: $n$ trustees maintain key shares $sk_i$, generating joint public key $PK_{\text{joint}} = \sum PK_i$. Decryption combines partial decryptions $W_i = sk_i \cdot C_{1,\text{sum}}$, each proven via Chaum-Pedersen DLEQ.
   - *vetKeys Integration Roadmap*: ICP native `vetKeys` (threshold key derivation) integration is planned as system APIs finalize.

3. **Coercion & Vote-Selling [OUT OF SCOPE]**:
   - System does not prevent coercion. A voter can prove their vote by revealing randomness $r$.

4. **Client-Side Device Compromise [OUT OF SCOPE]**:
   - Malware on a voter's machine altering votes before encryption cannot be solved on-chain.

5. **Cryptographic Randomness**:
   - Client-side encryption relies on OS CSPRNG (`rand::thread_rng()`).
