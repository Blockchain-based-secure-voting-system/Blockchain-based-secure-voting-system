# Security Policy & Responsible Vulnerability Disclosure

## Reporting a Vulnerability

If you discover a cryptographic, smart-contract (canister), or frontend security vulnerability in this repository, **do not open a public GitHub issue or pull request**.

Please report the vulnerability privately using **GitHub Private Vulnerability Reporting** at:

- **Report URL:** <https://github.com/Blockchain-based-secure-voting-system/Blockchain-based-secure-voting-system/security/advisories/new>

> **Note for the Repository Owner / Maintainer:**
> For researchers to submit private advisories through the link above, **Private Vulnerability Reporting** must be enabled in GitHub repository settings under:
> `Settings` -> `Code security and analysis` -> `Private vulnerability reporting` -> **Enable**.
> If it is not yet enabled, please enable it before deploying this system in any live environment.

### What to Include in a Report

1. **Affected Component:** (`crates/voting_crypto`, `crates/voting_crypto_wasm`, `canister`, `cli`, or `frontend`).
2. **Reproduction Steps or Proof-of-Concept:** Exact inputs, test case, or command sequence demonstrating the issue.
3. **Cryptographic or Security Impact:** Whether the issue affects ballot secrecy, tally integrity, voter eligibility enforcement, double-vote nullifiers, or client-side secret handling.

---

## Scope & Standing Architectural Limitations

This system implements end-to-end verifiable homomorphic tallying over BN254 with 1-out-of-2 disjunctive Chaum-Pedersen range proofs, Keccak-256 nullifiers, and $n$-of-$m$ Shamir secret sharing. However, the following architectural boundaries are **known design constraints** (documented prominently in the application's `/learn` page) rather than undisclosed bugs:

1. **Single-Dealer Threshold Key Generation (No Distributed Key Generation):**
   `generate_threshold_trustee_keys` generates the master secret key and splits it into $m$ Shamir shares on a single machine before zeroizing the dealer copy. A compromised dealer device at key-generation time could capture the full master secret key.
2. **No Receipt-Freeness or Coercion Resistance:**
   A voter who records their random encryption scalar or reveals their secret passphrase to a third party can prove how they voted, and remote voting takes place in an unsupervised environment.
3. **Client Endpoint Integrity Out of Scope:**
   Encryption and zero-knowledge proof generation occur inside the voter's browser via WebAssembly (`voting_crypto_wasm`). Malware, malicious browser extensions, or compromised operating systems on the voter's device can observe or alter the vote before encryption.
4. **No Independent Third-Party Cryptographic Audit:**
   This codebase has not undergone an external commercial or academic security audit.
