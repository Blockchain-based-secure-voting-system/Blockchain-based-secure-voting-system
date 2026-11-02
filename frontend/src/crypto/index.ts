import initWasm, {
  combine_threshold_shares_wasm,
  decrypt_and_prove_tally_wasm,
  generate_threshold_trustee_keys,
  generate_voter_ballot,
  verify_ballot_range_proof,
} from './pkg/voting_crypto_wasm.js';

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

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureCryptoInitialized(): Promise<void> {
  if (initialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      await initWasm();
      initialized = true;
    })();
  }
  return initPromise;
}

/**
 * Client-Side Encrypted Ballot Generation with ZK Range Proof.
 * Plaintext vote value is encrypted in WASM memory and NEVER returned to JS.
 */
export async function createClientSideBallot(
  masterPkHex: string,
  voterSecret: string,
  electionId: string,
  vote: 0 | 1
): Promise<WasmBallot> {
  await ensureCryptoInitialized();
  return generate_voter_ballot(masterPkHex, voterSecret, electionId, vote) as WasmBallot;
}

/**
 * Verify 1-out-of-2 Disjunctive Range Proof locally
 */
export async function verifyClientRangeProof(
  masterPkHex: string,
  c1Hex: string,
  c2Hex: string,
  rangeProof: unknown
): Promise<boolean> {
  await ensureCryptoInitialized();
  return verify_ballot_range_proof(masterPkHex, c1Hex, c2Hex, rangeProof);
}

/**
 * Generate n-of-m Threshold Keypair (Trustee Setup)
 */
export async function generateThresholdKeys(
  threshold: number,
  totalShares: number
): Promise<WasmThresholdSetup> {
  await ensureCryptoInitialized();
  const raw = generate_threshold_trustee_keys(BigInt(threshold), BigInt(totalShares));
  return {
    threshold: Number(raw.threshold),
    total_shares: Number(raw.total_shares),
    master_pk_hex: String(raw.master_pk_hex),
    shares: Array.from(raw.shares || []).map((s: any) => ({
      index: Number(s.index),
      share_hex: String(s.share_hex),
    })),
  };
}

/**
 * Reconstruct Secret Key from Threshold Shares (Trustee Tallying)
 */
export async function combineKeyShares(
  shares: Array<{ index: number; share_hex: string }>
): Promise<string> {
  await ensureCryptoInitialized();
  const cleanShares = shares.map((s) => ({
    index: s.index,
    share_hex: s.share_hex.startsWith('0x') || s.share_hex.startsWith('0X') ? s.share_hex.slice(2) : s.share_hex,
  }));
  return combine_threshold_shares_wasm(cleanShares);
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
  await ensureCryptoInitialized();
  const cleanSk = skHex.startsWith('0x') || skHex.startsWith('0X') ? skHex.slice(2) : skHex;
  const cleanC1 = c1SumHex.startsWith('0x') || c1SumHex.startsWith('0X') ? c1SumHex.slice(2) : c1SumHex;
  const cleanC2 = c2SumHex.startsWith('0x') || c2SumHex.startsWith('0X') ? c2SumHex.slice(2) : c2SumHex;
  return decrypt_and_prove_tally_wasm(cleanSk, cleanC1, cleanC2, BigInt(maxBound)) as WasmDecryptionResult;
}
