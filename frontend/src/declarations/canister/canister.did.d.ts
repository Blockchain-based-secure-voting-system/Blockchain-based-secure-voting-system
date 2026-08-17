import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';

export type ElectionPhase = { 'Setup': null } |
  { 'Voting': null } |
  { 'Tallying': null } |
  { 'Complete': null };

export interface HexCiphertext {
  'c1_hex': string;
  'c2_hex': string;
}

export interface HexDisjunctiveRangeProof {
  'a0_hex': string;
  'b0_hex': string;
  'a1_hex': string;
  'b1_hex': string;
  'c0_hex': string;
  'c1_hex': string;
  's0_hex': string;
  's1_hex': string;
}

export interface Ballot {
  'nullifier': Uint8Array | number[];
  'ciphertext': HexCiphertext;
  'range_proof': HexDisjunctiveRangeProof;
}

export interface EncryptedTally {
  'c1_hex': string;
  'c2_hex': string;
  'total_ballots': bigint;
}

export interface ElectionDetails {
  'title': string;
  'admin': Principal;
  'trustee_pk_hex': string;
  'phase': ElectionPhase;
  'start_time': bigint;
  'end_time': bigint;
  'registered_voters_count': bigint;
  'total_ballots_cast': bigint;
  'final_tally': [] | [bigint];
  'proof_verified': boolean;
}

export interface HexChaumPedersenProof {
  'a_hex': string;
  'b_hex': string;
  's_hex': string;
  'w_hex': string;
  'decrypted_tally': bigint;
}

export type ResultText = { 'Ok': string } | { 'Err': string };
export type ResultNat64 = { 'Ok': bigint } | { 'Err': string };
export type ResultTally = { 'Ok': EncryptedTally } | { 'Err': string };

export declare const idlFactory: ({ IDL }: { IDL: any }) => any;
export declare const init: ({ IDL }: { IDL: any }) => any[];

export interface _SERVICE {
  'create_election': ActorMethod<[string, string, bigint, bigint], ResultText>;
  'register_voters': ActorMethod<[Array<Principal>], ResultNat64>;
  'open_voting': ActorMethod<[], ResultText>;
  'cast_ballot': ActorMethod<[Ballot], ResultText>;
  'close_voting': ActorMethod<[], ResultText>;
  'submit_decryption_proof': ActorMethod<[HexChaumPedersenProof], ResultNat64>;
  'get_election_details': ActorMethod<[], ElectionDetails>;
  'get_encrypted_tally': ActorMethod<[], ResultTally>;
  'is_voter_registered': ActorMethod<[Principal], boolean>;
  'has_nullifier_been_used': ActorMethod<[Uint8Array | number[]], boolean>;
}
