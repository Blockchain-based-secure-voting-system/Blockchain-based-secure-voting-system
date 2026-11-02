export type ElectionPhase = 'Setup' | 'Voting' | 'Tallying' | 'Complete';

export interface ElectionDetails {
  id: string;
  title: string;
  admin: string;
  trustee_pk_hex: string;
  phase: ElectionPhase | { [K in ElectionPhase]?: null };
  start_time: bigint;
  end_time: bigint;
  registered_voters_count: bigint;
  total_ballots_cast: bigint;
  final_tally: [] | [bigint];
  proof_verified: boolean;
  chain_head_hash?: string;
  roll_commitment_hex?: string;
}

export interface EncryptedTally {
  c1_hex: string;
  c2_hex: string;
  total_ballots: bigint;
}

export interface HexCiphertext {
  c1_hex: string;
  c2_hex: string;
}

export interface HexDisjunctiveRangeProof {
  a0_hex: string;
  b0_hex: string;
  a1_hex: string;
  b1_hex: string;
  c0_hex: string;
  c1_hex: string;
  s0_hex: string;
  s1_hex: string;
}

export interface HexChaumPedersenProof {
  a_hex: string;
  b_hex: string;
  z_hex: string;
}

export interface Ballot {
  nullifier: Uint8Array | number[];
  ciphertext: HexCiphertext;
  range_proof: HexDisjunctiveRangeProof;
}

export interface BulletinEntry {
  sequence_number: number;
  prev_hash: string;
  entry_hash: string;
  nullifier_hex: string;
  ciphertext_c1_hex: string;
  ciphertext_c2_hex: string;
  range_proof: HexDisjunctiveRangeProof;
}

export interface BallotReceipt {
  sequence_number: number;
  entry_hash: string;
  prev_hash: string;
  chain_head_hash: string;
  nullifier_hex: string;
  message: string;
}
