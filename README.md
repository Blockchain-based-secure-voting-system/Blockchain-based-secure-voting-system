# Decentralized Electronic Voting System on Internet Computer Protocol (ICP)

A production-quality, privacy-preserving, zero-knowledge electronic voting system built on the **Internet Computer Protocol (ICP)** using Rust, Candid, **BN254 ElGamal Homomorphic Encryption**, per-voter nullifiers, and **Chaum-Pedersen Zero-Knowledge Proofs (NIZK DLEQ)**.

---

## 🏛️ System Architecture

```
                                  +-------------------------------------------------------+
                                  |                  RUST CLI CLIENT                      |
                                  |  - ElGamal KeyGen (Trustee sk / PK on BN254)          |
                                  |  - Vote Encryption: C = (r*G, r*PK + m*G)             |
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
|  State Machine & Security Checks:                                                                                 |
|   1. Phase & Timestamp Validation                                                                                 |
|   2. Caller Principal Eligibility (Internet Identity)                                                             |
|   3. Nullifier Uniqueness Check (Prevents Double-Voting)                                                          |
|   4. BN254 G1 Curve-Membership Point Validation                                                                   |
|   5. Homomorphic Tally Accumulation: C_sum = sum(C_i)                                                            |
|   6. On-Chain Chaum-Pedersen ZK Decryption Proof Verification                                                    |
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
  $$C = (C_1, C_2) = (r \cdot G, \, r \cdot PK + m \cdot G)$$
- **Homomorphic Addition**: Given $N$ ciphertexts $C^{(i)} = (C_1^{(i)}, C_2^{(i)})$:
  $$C_{\text{sum}} = (C_{1,\text{sum}}, C_{2,\text{sum}}) = \left( \sum_{i=1}^N C_1^{(i)}, \; \sum_{i=1}^N C_2^{(i)} \right) = \left( \left(\sum r_i\right) \cdot G, \; \left(\sum r_i\right) \cdot PK + \left(\sum m_i\right) \cdot G \right)$$
- **Decryption**: Trustee computes decryption factor $W = sk \cdot C_{1,\text{sum}}$, then subtracts $W$ from $C_{2,\text{sum}}$:
  $$D = C_{2,\text{sum}} - W = \left(\sum m_i\right) \cdot G = M_{\text{total}} \cdot G$$
- **Discrete Log Solver**: $M_{\text{total}}$ is recovered from $D = M_{\text{total}} \cdot G$ using the **Baby-Step Giant-Step (BSGS)** algorithm in $O(\sqrt{M})$ time.

### 3. Chaum-Pedersen Zero-Knowledge Decryption Proof (NIZK DLEQ)
To convince the canister and voters that $M_{\text{total}}$ is the true tally without revealing $sk$:
- **Statement**: Trustee proves knowledge of $sk$ such that $PK = sk \cdot G$ and $W = sk \cdot C_{1,\text{sum}}$.
- **Commitment**: Prover selects random nonce $k \xleftarrow{\$} \mathbb{F}_q$ and computes $A = k \cdot G$, $B = k \cdot C_{1,\text{sum}}$.
- **Fiat-Shamir Challenge**:
  $$c = \text{Keccak256}(\text{"CHAUM\_PEDERSEN\_BN254\_V1"} \parallel G \parallel PK \parallel C_{1,\text{sum}} \parallel W \parallel A \parallel B) \pmod q$$
- **Response**: $s = k + c \cdot sk \pmod q$.
- **Verification Equations (On-Chain Canister)**:
  $$s \cdot G \stackrel{?}{=} A + c \cdot PK$$
  $$s \cdot C_{1,\text{sum}} \stackrel{?}{=} B + c \cdot W$$
  $$C_{2,\text{sum}} - W \stackrel{?}{=} M_{\text{total}} \cdot G$$

### 4. Nullifier & Double-Voting Prevention
- Each ballot includes a deterministic 32-byte nullifier:
  $$\text{nullifier} = \text{Keccak256}(\text{"VOTING\_NULLIFIER\_V1"} \parallel \text{voter\_secret} \parallel \text{election\_id})$$
- The canister records every submitted nullifier in stable state (`BTreeSet<[u8; 32]>`). Subsequent ballot submissions containing a used nullifier are rejected immediately with `Double-vote detected`.

---

## 🛠️ Prerequisites & Installation

### Requirements
- **Rust Toolchain**: 1.75+ (installed via `rustup`).
- **WebAssembly Target**: `wasm32-unknown-unknown`.
- **Internet Computer SDK**: `dfx` (v0.15+).

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
This tests:
- ElGamal keygen, encryption, and homomorphic addition.
- BSGS discrete log solver for bounded tally bounds.
- Chaum-Pedersen zero-knowledge proof generation and tampering detection.
- Nullifier determinism and uniqueness.

### 2. Build Wasm Canister & CLI Binary
```bash
# Build ICP canister Wasm
cargo build --package canister --target wasm32-unknown-unknown --release

# Build CLI binary
cargo build --package cli --release
```

---

## 💻 Local ICP Deployment & Mock Election Walkthrough

### 1. Start Local ICP Replica
```bash
dfx start --background --clean
```

### 2. Deploy Canister
```bash
dfx deploy
```
*Note the generated Canister ID (e.g., `bkyz2-fmaaa-aaaaa-qaaaq-cai`).*

### 3. End-to-End Election Execution via CLI

#### Step 1: Trustee Key Generation
```bash
cargo run -p cli -- keygen
```
*Output:*
```text
=== ElGamal KeyPair Generated (BN254 Curve) ===
Trustee Secret Key (sk): 1e2f...
Trustee Public Key (PK): 08a4...
```

#### Step 2: Create Election (Admin)
```bash
cargo run -p cli -- create-election \
  --canister-id "bkyz2-fmaaa-aaaaa-qaaaq-cai" \
  --title "2026 Presidential Referendum" \
  --trustee-pk "<TRUSTEE_PK_HEX>"
```

#### Step 3: Register Voters (Admin)
```bash
cargo run -p cli -- register-voters \
  --canister-id "bkyz2-fmaaa-aaaaa-qaaaq-cai" \
  --voters "2vxsx-fae,anonymous"
```

#### Step 4: Open Voting (Admin)
```bash
cargo run -p cli -- open-voting \
  --canister-id "bkyz2-fmaaa-aaaaa-qaaaq-cai"
```

#### Step 5: Cast Encrypted Ballots (Voters)
```bash
# Voter 1 votes YES (1)
cargo run -p cli -- cast-vote \
  --canister-id "bkyz2-fmaaa-aaaaa-qaaaq-cai" \
  --trustee-pk "<TRUSTEE_PK_HEX>" \
  --voter-secret "voter_1_secret_passphrase" \
  --election-id "2026_referendum" \
  --vote 1

# Voter 2 votes YES (1)
cargo run -p cli -- cast-vote \
  --canister-id "bkyz2-fmaaa-aaaaa-qaaaq-cai" \
  --trustee-pk "<TRUSTEE_PK_HEX>" \
  --voter-secret "voter_2_secret_passphrase" \
  --election-id "2026_referendum" \
  --vote 1
```

#### Step 6: Close Voting (Admin)
```bash
cargo run -p cli -- close-voting \
  --canister-id "bkyz2-fmaaa-aaaaa-qaaaq-cai"
```

#### Step 7: Decrypt Tally & Submit ZK Proof (Trustee)
```bash
cargo run -p cli -- tally-decrypt-and-prove \
  --canister-id "bkyz2-fmaaa-aaaaa-qaaaq-cai" \
  --trustee-sk "<TRUSTEE_SK_HEX>"
```
*Output:*
```text
Fetched Encrypted Tally Sum:
  Total Ballots Cast: 2
Solving discrete log M * G = D using BSGS algorithm...
Decrypted Raw Tally Result: 2 YES votes out of 2 total ballots
Generating Chaum-Pedersen Zero-Knowledge Proof of Decryption...

=======================================================
ELECTION TALLY VERIFIED AND FINALIZED ON-CHAIN!
Verified Tally Result: 2
Zero-Knowledge Decryption Proof: VALIDATED BY CANISTER
=======================================================
```

---

## ⚠️ Security Limitations & Architectural Constraints

> [!CAUTION]
> This system is designed with rigorous cryptographic primitives, but developers and reviewers must be aware of the following known limitations:

1. **Single Trustee Weak Point (Key Management)**:
   - *Current Implementation*: The secret key $sk$ is generated and held by a single trustee. If this trustee key is lost, tally decryption is impossible; if compromised, privacy of individual ballots is lost.
   - *Recommended Follow-Up*: Transition to a Distributed Key Generation (DKG) threshold ElGamal scheme, or integrate ICP's native threshold key derivation (`vetKeys`) once API stability is verified against up-to-date ICP documentation.

2. **Absence of Ballot Range Proofs**:
   - *Current Implementation*: A honest voter encrypts $m \in \{0, 1\}$. However, the canister currently does not verify a Zero-Knowledge Range Proof (e.g. 1-out-of-2 Disjunctive Chaum-Pedersen Proof or Bulletproofs) that a submitted ciphertext encodes strictly 0 or 1.
   - *Security Risk*: A malicious voter could encrypt $m = 100$ or a negative scalar to skew the homomorphic tally.

3. **Coercion & Vote-Selling**:
   - *Current Implementation*: The system does not provide coercion resistance. A voter can prove to a third party how they voted by revealing their encryption randomness $r$.

4. **Client-Side Device Compromise**:
   - *Out of Scope*: Malware on a voter's machine can alter the intended vote prior to encryption. No blockchain or smart contract mechanism can prevent client-side device compromise.

5. **Cryptographic Randomness**:
   - Client-side encryption and ZK proof generation rely strictly on `rand::thread_rng()` / OS CSPRNG. Never replace this with deterministic or pseudo-random seeds.
