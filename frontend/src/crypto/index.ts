export interface WasmBallot {
  nullifier: number[];
  ciphertext: {
    c1_hex: string;
    c2_hex: string;
  };
  range_proof: {
    a0_hex: string;
    b0_hex: string;
    a1_hex: string;
    b1_hex: string;
    c0_hex: string;
    c1_hex: string;
    s0_hex: string;
    s1_hex: string;
  };
}

export interface WasmDecryptionResult {
  decrypted_tally: bigint | number;
  hex_proof: {
    a_hex: string;
    b_hex: string;
    s_hex: string;
    w_hex: string;
    decrypted_tally: bigint | number;
  };
}

export interface WasmThresholdSetup {
  threshold: number;
  total_shares: number;
  master_pk_hex: string;
  shares: Array<{
    index: number;
    share_hex: string;
  }>;
}

let wasmModule: any = null;
let initPromise: Promise<any> | null = null;

export async function getVotingCrypto() {
  if (wasmModule) return wasmModule;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        const pkgName = 'voting_crypto_wasm';
        // @ts-ignore
        const mod = await import(/* @vite-ignore */ pkgName);
        if (typeof mod.default === 'function') {
          await mod.default();
        }
        wasmModule = mod;
        return mod;
      } catch (err) {
        console.warn('WASM module direct import unavailable, checking dynamic path:', err);
        try {
          const localPath = './pkg/voting_crypto_wasm.js';
          // @ts-ignore
          const mod = await import(/* @vite-ignore */ localPath);
          if (typeof mod.default === 'function') {
            await mod.default();
          }
          wasmModule = mod;
          return mod;
        } catch (e2) {
          throw new Error('WebAssembly voting_crypto_wasm module could not be loaded. Ensure wasm-pack build has been executed.');
        }
      }
    })();
  }

  return initPromise;
}

/**
 * Client-Side Encrypted Ballot Generation with ZK Range Proof
 * Plaintext vote value is encrypted in WASM memory and NEVER returned to JS.
 */
export async function createClientSideBallot(
  masterPkHex: string,
  voterSecret: string,
  electionId: string,
  vote: 0 | 1
): Promise<WasmBallot> {
  const crypto = await getVotingCrypto();
  return crypto.generate_voter_ballot(masterPkHex, voterSecret, electionId, vote);
}

/**
 * Verify 1-out-of-2 Disjunctive Range Proof locally
 */
export async function verifyClientRangeProof(
  masterPkHex: string,
  c1Hex: string,
  c2Hex: string,
  rangeProof: any
): Promise<boolean> {
  const crypto = await getVotingCrypto();
  return crypto.verify_ballot_range_proof(masterPkHex, c1Hex, c2Hex, rangeProof);
}

/**
 * Generate n-of-m Threshold Keypair (Trustee Setup)
 */
export async function generateThresholdKeys(
  threshold: number,
  totalShares: number
): Promise<WasmThresholdSetup> {
  const crypto = await getVotingCrypto();
  return crypto.generate_threshold_trustee_keys(threshold, totalShares);
}

/**
 * Reconstruct Secret Key from Threshold Shares (Trustee Tallying)
 */
export async function combineKeyShares(
  shares: Array<{ index: number; share_hex: string }>
): Promise<string> {
  const crypto = await getVotingCrypto();
  return crypto.combine_threshold_shares_wasm(shares);
}

/**
 * Solve Discrete Log (BSGS) and Generate Chaum-Pedersen Decryption Proof
 */
export async function decryptAndProveTally(
  skHex: string,
  c1SumHex: string,
  c2SumHex: string,
  maxBound: number = 10000
): Promise<WasmDecryptionResult> {
  const crypto = await getVotingCrypto();
  return crypto.decrypt_and_prove_tally_wasm(skHex, c1SumHex, c2SumHex, BigInt(maxBound));
}
