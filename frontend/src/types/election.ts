import { Principal } from './principal';

export interface Ballot {
  range_proof: HexDisjunctiveRangeProof;
  ciphertext: HexCiphertext;
  nullifier: Uint8Array | number[];
}

export interface ElectionDetails {
  title: string;
  final_tally: [] | [bigint];
  admin: Principal;
  trustee_pk_hex: string;
  end_time: bigint;
  total_ballots_cast: bigint;
  start_time: bigint;
  proof_verified: boolean;
  registered_voters_count: bigint;
  phase: ElectionPhase;
}

export type ElectionPhase =
  | { Setup: null }
  | { Tallying: null }
  | { Complete: null }
  | { Voting: null };

export interface EncryptedTally {
  c1_hex: string;
  c2_hex: string;
  total_ballots: bigint;
}

export interface HexChaumPedersenProof {
  a_hex: string;
  s_hex?: string;
  b_hex: string;
  decrypted_tally?: bigint;
  w_hex?: string;
  z_hex?: string;
}

export interface HexCiphertext {
  c1_hex: string;
  c2_hex: string;
}

export interface HexDisjunctiveRangeProof {
  c1_hex: string;
  b0_hex: string;
  a1_hex: string;
  s1_hex: string;
  c0_hex: string;
  b1_hex: string;
  a0_hex: string;
  s0_hex: string;
}

export interface VoterLoginResponse {
  session_token: string;
  expires_at: string;
  election_phase: string;
}

export interface BallotReceiptResponse {
  sequence_number: number;
  entry_hash: string;
  prev_hash: string;
  chain_head_hash: string;
  nullifier_hex: string;
  message: string;
}

export interface BulletinEntry {
  sequence_number: number;
  entry_hash: string;
  prev_hash: string;
  nullifier_hex: string;
  ciphertext_c1_hex: string;
  ciphertext_c2_hex: string;
  range_proof_json: any;
  recorded_at: string;
}

export interface BulletinLogResponse {
  entries: BulletinEntry[];
  total_count: number;
  chain_head_hash: string;
}
