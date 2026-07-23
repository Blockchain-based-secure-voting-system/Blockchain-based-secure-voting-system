# Changelog

All notable changes to the Decentralized Electronic Voting System on ICP are documented in this file.

## [0.2.0] - 2026-07-23 - Phase 2 Hardening & Production Readiness

### Added
- **1-out-of-2 Disjunctive Chaum-Pedersen Zero-Knowledge Range Proof**:
  - Implemented client-side NIZK range proof generation in `voting_crypto::range_proof` proving that encrypted ballot scalar $m \in \{0, 1\}$ without revealing $m$.
  - Integrated canister-side range proof verification in `canister::cast_ballot`. Ballots with out-of-range vote values or tampered proofs are rejected on-chain.
  - Closes Security Gap #2.
- **Canister Upgrade Hooks (`pre_upgrade` / `post_upgrade`)**:
  - Implemented ICP stable memory storage hooks in `canister/src/lib.rs` to persist election details, registered voter principals, used nullifiers, and encrypted tally across canister Wasm code upgrades.
- **Threshold ElGamal & vetKeys Security Roadmap**:
  - Formulated a joint multi-trustee Threshold ElGamal scheme ($PK_{\text{joint}} = \sum PK_i$, partial decryptions $W_i$ with DLEQ proofs, $W = \sum W_i$) to replace the single trustee dependency as an interim step.
  - Documented ICP `vetKeys` integration plan.
- **GitHub Actions CI Workflow**:
  - Added `.github/workflows/ci.yml` running `cargo test --workspace`, `cargo clippy -- -D warnings`, and `wasm32-unknown-unknown` compilation on every push/PR.
- **Expanded Cryptographic Test Suite**:
  - Added range proof soundness/completeness unit tests, tampered proof detection tests, and curve-membership validation tests.

### Changed
- Updated Candid interface (`canister.did`) and CLI `cast-vote` command to include `HexDisjunctiveRangeProof`.
- Updated `README.md` with range proof specifications, updated security limitations, and stable memory details.
