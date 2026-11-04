# Architectural Decision Record (ADR) 001: Migration from Legacy Wasm Service to Axum + PostgreSQL

- **Status**: Accepted & In Implementation
- **Date**: 2026-11-01
- **Authors**: Backend & Full-Stack Security Engineering Team

---

## 1. Context & Motivation

This project originally implemented an electronic voting system on the Legacy Execution Environment using Rust legacy services (`ic-cdk`), Candid serialization, and Legacy Architecture stable memory hooks. While Legacy Architecture provides a distributed state machine and integrated consensus, deploying and operating within the legacy service execution environment introduced significant operational constraints:
1. **Tooling and Execution Friction**: legacy service Wasm compilation requires the proprietary DFX toolchain and synthetic local replicas, preventing native unit testing of state transitions with standard `cargo test` and restricting native Windows development.
2. **Short-Lived Public Deployment Limitations**: The free Legacy Architecture Playground pool enforces a strict 20-minute time-to-live (TTL), wiping all state and generating a new legacy service Principal ID upon every deployment.
3. **Complex Identity Derivation Model**: external identity provider generates origin-scoped pseudonyms, meaning credentials derived on a staging/preview domain cannot be reused on a production domain without manual alternative-origin certification.

To establish a production-grade, easily auditable, and reliable civic voting service, the decision has been made to migrate the backend to a conventional **Axum (Rust) + PostgreSQL** stack deployed on **Render** (free tier), with the static frontend on **Vercel** (Hobby tier).

---

## 2. Infrastructure & Hosting Operational Constraints

The architecture is specifically designed around the documented constraints of the free hosting tiers (verified November 2026):

### 2.1 Render Free Tier (Web Service & Database)
- **Automatic Inactivity Spin-Down**: Free Render web services automatically sleep after **15 minutes** of zero inbound traffic. A subsequent inbound request triggers a **cold start lasting approximately 30 to 60 seconds**.
  - *Architectural Accommodation*: The frontend client must implement a clear "Server is waking up" state, non-blocking polling, exponential retry logic, and generous connection timeouts rather than immediately failing with generic network errors.
- **Ephemeral Filesystem**: Render web services run in ephemeral containers where local filesystem modifications are lost across deploys and restarts.
  - *Architectural Accommodation*: Local file databases (e.g. SQLite) cannot be used for persistent state. All election records, credentials, nullifiers, and bulletin logs are stored in a managed PostgreSQL database.
- **30-Day PostgreSQL Expiration**: Render's free PostgreSQL instances expire **30 days** after creation, after which the database becomes inaccessible and is permanently dropped following a 14-day grace period. Free instances are also limited to 1 GB storage and 100 maximum connections.
  - *Architectural Accommodation*: The system must support straightforward schema migrations via SQLx, automated backup export scripts (`pg_dump`), and clean re-initialization procedures.

### 2.2 Vercel Hobby Tier (Frontend)
- **Non-Commercial Restriction**: Vercel Hobby accounts are strictly restricted to non-commercial, personal, or evaluation use.
- **Edge Security Headers & Routing**: Requires `vercel.json` rewrites for SPA client routing, explicit MIME types (`application/wasm`) for compiled WebAssembly cryptographic assets, and strict Content Security Policy (CSP) directives with `connect-src` limited to the Render backend API domain and `script-src` allowing `'wasm-unsafe-eval'`.

---

## 3. What Moves vs. What Stays

### 3.1 What Moves (New and Replaced Components)
- **`legacy service/` Archived**: The original Legacy Architecture legacy service code and Candid service definitions are moved to `archive/legacy-backend/` and excluded from the active Cargo workspace.
- **Pure Core State Machine (`crates/election_core`)**:
  - A zero-I/O, deterministic Rust crate implementing the pure election lifecycle state machine (`Setup`, `Voting`, `Tallying`, `Complete`).
  - Contains all transition guards, server-driven wall-clock deadline checks (completely rejecting client-supplied timestamps), ballot mathematical validation (curve membership, range proof verification), and error definitions.
  - 100% testable via native `cargo test` without any database, network, or replica dependencies.
- **Axum Web Server (`crates/server`)**:
  - High-performance, memory-safe REST API built on `axum 0.7+` and `tokio`.
  - Database persistence via `sqlx 0.8+` targeting PostgreSQL with versioned migrations and transactional ballot casting.
  - Self-documenting OpenAPI 3.0 specification generated via `utoipa` with automated TypeScript type generation.
- **Voter Authentication Overhaul**:
  - Replaces external identity provider with single-use, high-entropy (>= 128-bit) alphanumeric **Credential Codes** issued by election administrators during the Setup phase.
  - Distributed out-of-band to voters. Stored only as salted cryptographic hashes (e.g. SHA-256 / Argon2id) in the database.
  - Exchanged at `/api/v1/voter/login` for a short-lived bearer token (JWT) kept exclusively in volatile browser memory.
  - The credential code is marked consumed within the same atomic database transaction that accepts and commits a verified ballot.
- **Admin Authentication**:
  - Protected by a high-entropy secret token provided via the `ADMIN_SECRET_KEY` environment variable.
  - Evaluated against incoming HTTP headers using constant-time comparison (`subtle::ConstantTimeEq`) to prevent timing side-channel attacks.
- **Cryptographic Bulletin Board**:
  - Implements an append-only, hash-chained ledger in PostgreSQL:
    $$\text{entry\_hash}_i = \text{SHA256}(\text{prev\_hash}_{i-1} \parallel \text{ballot\_bytes}_i)$$
  - Database-level immutability enforced through revoked `UPDATE` and `DELETE` privileges and a database trigger preventing row modifications.
  - Generates verifiable ballot receipts containing the sequence index, ballot entry hash, and chain head hash.
- **Roll Commitment**:
  - When the administrator transitions the election to the `Voting` phase, the server calculates and permanently publishes an authoritative Merkle / hash commitment over the sorted set of issued credential hashes, along with published counts of credentials issued, credentials used, and ballots recorded.
- **CLI Client (`cli/`)**:
  - Replaces `ic-agent` with standard `reqwest` HTTP client calls.
  - Adds a standalone, offline `verify-election` audit command that downloads the public bulletin log and re-verifies the hash chain, every range proof, the homomorphic tally sum, and the decryption proof.
- **Frontend (`frontend/`)**:
  - Removes all `legacy identity packages` packages.
  - Replaces Legacy Architecture actor calls with a generated, strongly typed API client.
  - Introduces a Credential Code login interface and graceful cold-start waiting UI.

### 3.2 What Stays (Preserved Cryptography & Design)
- **`crates/voting_crypto` (100% Preserved)**:
  - Barreto-Naehrig BN254 ($G_1$ prime-order subgroup) Exponential ElGamal homomorphic encryption.
  - 1-out-of-2 Disjunctive Chaum-Pedersen zero-knowledge range proofs ($m \in \{0, 1\}$).
  - Baby-Step Giant-Step (BSGS) discrete logarithm solver for tally recovery within bounded voter limits.
  - Chaum-Pedersen zero-knowledge decryption proof generation and verification (NIZK DLEQ under Fiat-Shamir).
  - Deterministic voter nullifiers: $\text{nullifier} = \text{Keccak256}(\text{"VOTING\_NULLIFIER\_V1"} \parallel \text{secret} \parallel \text{election\_id})$.
  - Shamir $n$-of-$m$ polynomial threshold secret sharing and Lagrange basis interpolation.
- **`crates/voting_crypto_wasm` (100% Preserved)**:
  - Retained as the client-side cryptographic engine so that voter secrets, plaintext choices, and trustee secret shares never leave the user's browser unencrypted.
- **Visual Design System**:
  - White, black, and cobalt blue theme meeting WCAG 2.1 AA contrast standards and axe-core accessibility compliance.

---

## 4. The New Trust Model

The migration from a distributed smart contract platform to a conventional client-server architecture fundamentally alters the system's trust assumptions. This change must be explicitly disclosed across all documentation and user interfaces.

### 4.1 Centralized Operator Authority
In the Axum + PostgreSQL architecture, **the operator of the server and database controls**:
1. **Voter Eligibility**: The administrator generates and distributes credential codes. An operator could selectively refuse to issue credentials to certain voters or create unauthorized credentials if unconstrained by an out-of-band audit.
2. **Liveness and Availability**: The operator controls the server hardware and database hosting. The operator can take the system offline, delay requests, or shut down access.
3. **Phase Progression**: The administrator controls the initiation and closing of the election phases.
4. **Censorship / Exclusion Capability**: A dishonest operator could drop or refuse to process a ballot submission request.

### 4.2 Verifiable Mathematical Integrity
Despite centralized operational control, **the system maintains public verifiability**:
1. **Ballot Secrecy Against Operator & Observers**: Individual ballots are encrypted client-side inside the browser using BN254 Exponential ElGamal under the trustee public key. The operator, database administrator, and public observers see only ciphertext points $(C_1, C_2)$ on $G_1$.
2. **Validity Enforcement**: Every ballot must contain a valid 1-out-of-2 disjunctive Chaum-Pedersen ZK range proof verifying that the encrypted plaintext is strictly $m \in \{0, 1\}$. Invalid votes cannot be injected without failing public verification.
3. **Double-Voting Prevention**: Database-level `UNIQUE` constraints and application logic enforce that a 32-byte nullifier can be recorded at most once.
4. **Tamper-Evident Ledger**: The bulletin board hash chain links each entry to its predecessor. While a database superuser with write access could technically alter rows, doing so breaks the published cryptographic hash chain and invalidates receipts held by voters and monitors.
5. **Decryption Separation**: Decryption requires at least $n$ of $m$ independent trustees to combine their secret shares or decryption factors. The server operator cannot decrypt individual ballots or the final tally alone. The final tally must be accompanied by a verifiable Chaum-Pedersen DLEQ proof.

---

## 5. Threat Model & Out-of-Scope Risks

### 5.1 Threats Addressed
| Threat | Mitigation Mechanism |
| :--- | :--- |
| **Ballot Tampering / Forgery** | Homomorphic ElGamal encryption under trustee public key; client-side ZK range proof verified by server before acceptance. |
| **Out-of-Range Ballot Stuffing** | 1-out-of-2 Disjunctive Chaum-Pedersen ZK range proof checked against $G_1$ curve points. |
| **Double-Voting** | Deterministic 32-byte nullifier generated client-side from voter secret and election ID; enforced by database `UNIQUE` constraint. |
| **Credential Guessing / Brute-Force** | High-entropy credential codes (>= 128 bits), IP and account rate-limiting, and temporary lockouts after repeated failed attempts. |
| **Admin Timing Attacks** | Admin bearer tokens verified using constant-time byte comparisons (`subtle::ConstantTimeEq`). |
| **Silent Ballot Deletion from Ledger** | Cryptographic hash chaining on the bulletin board log; client receives signed/hashed receipt with chain head hash. |
| **Malicious Premature Tallying** | $n$-of-$m$ Shamir threshold key custody ensures tally cannot be decrypted without cooperation of $n$ independent trustees. |
| **Network Injection / Replay** | Enforced TLS 1.3, strict Content Security Policy, and unique per-election nullifiers. |

### 5.2 Deliberately Out of Scope (Honest Disclosures)
1. **distributed Consensus**: The system is NOT distributed. It runs on a single server and database operated by an administrator.
2. **Anonymity Against a Malicious Infrastructure Operator**: The server operator has access to web server access logs, reverse proxy IP logs, TLS connection timestamps, and database insertion orders. An operator can correlate the exact network time a credential logged in with the arrival of a ballot payload. Complete network-level anonymity (e.g. Tor onion routing, mixnets) is out of scope.
3. **Single-Dealer Threshold Setup**: The Shamir secret sharing setup relies on a single dealer (run in volatile browser memory or CLI) to generate the master key and polynomial shares. Distributed Key Generation (DKG) protocols to eliminate the dealer setup are out of scope.
4. **Coercion Resistance & Receipt-Freeness**: A voter who reveals their private secret passphrase or random scalar $r$ can prove their ballot contents to a third party. The system does not provide deniable encryption or fake-credential decoys.
5. **Client Device Compromise**: If a voter's personal computer or browser has malware, keyloggers, or malicious browser extensions, the plaintext choice can be intercepted before WebAssembly encryption takes place.
6. **Denial-of-Service by Operator**: If the server operator shuts down the server during the voting window, voters cannot cast ballots. Verifiable recovery from total operator unavailability is out of scope.

---

## 6. Implementation Plan & Staged Commit Roadmap

To preserve the project's evidence discipline, all changes will be implemented in discrete, verifiable phases with CI remaining green at each step:
1. **ADR Documentation & Architecture Commitment** (`docs/adr-axum-migration.md`).
2. **Pure Core State Machine** (`crates/election_core`): No I/O, 100% unit-tested state transitions, range proof verification hooks.
3. **Server Implementation** (`crates/server`): Axum 0.7, SQLx PostgreSQL migrations, credential management, bulletin board triggers, OpenAPI generation, security hardening, and tests with failing-injection twins.
4. **Standalone Verifier & CLI Update** (`crates/cli`): `verify-election` command re-checking hash chain, proofs, and tally sum.
5. **Frontend Migration** (`frontend/`): Typed API client, credential code login, cold-start indicator, trust model copy updates.
6. **CI/CD Pipeline Update**: PostgreSQL service container in GitHub Actions replacing DFX tasks.
7. **Production Deployment & Documentation**: Render deployment manifests, Vercel configuration, and updated README trust disclosures.
