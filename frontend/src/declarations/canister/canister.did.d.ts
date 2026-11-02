import { Principal } from '../../types/principal';

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

export type ResultNat64 = { Ok: bigint } | { Err: string };
export type ResultTally = { Ok: EncryptedTally } | { Err: string };
export type ResultText = { Ok: string } | { Err: string };

export interface _SERVICE {
  cast_ballot: (ballot: Ballot) => Promise<ResultText>;
  close_voting: () => Promise<ResultText>;
  create_election: (title: string, trusteePk: string, start: bigint, end: bigint) => Promise<ResultText>;
  get_election_details: () => Promise<ElectionDetails>;
  get_encrypted_tally: () => Promise<ResultTally>;
  has_nullifier_been_used: (nullifier: Uint8Array | number[]) => Promise<boolean>;
  is_registered_voter: (principal: Principal) => Promise<boolean>;
  is_voter_registered: (principal: Principal) => Promise<boolean>;
  open_voting: () => Promise<ResultText>;
  register_voters: (voters: Principal[]) => Promise<ResultNat64>;
  submit_decryption_proof: (proof: HexChaumPedersenProof) => Promise<ResultNat64>;
}

export const idlFactory: (args: { IDL: any }) => any;
