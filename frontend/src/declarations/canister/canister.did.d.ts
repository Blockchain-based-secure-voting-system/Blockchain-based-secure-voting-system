import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface Ballot {
  'range_proof' : HexDisjunctiveRangeProof,
  'ciphertext' : HexCiphertext,
  'nullifier' : Uint8Array | number[],
}
export interface ElectionDetails {
  'title' : string,
  'final_tally' : [] | [bigint],
  'admin' : Principal,
  'trustee_pk_hex' : string,
  'end_time' : bigint,
  'total_ballots_cast' : bigint,
  'start_time' : bigint,
  'proof_verified' : boolean,
  'registered_voters_count' : bigint,
  'phase' : ElectionPhase,
}
export type ElectionPhase = { 'Setup' : null } |
  { 'Tallying' : null } |
  { 'Complete' : null } |
  { 'Voting' : null };
export interface EncryptedTally {
  'c1_hex' : string,
  'c2_hex' : string,
  'total_ballots' : bigint,
}
export interface HexChaumPedersenProof {
  'a_hex' : string,
  's_hex' : string,
  'b_hex' : string,
  'decrypted_tally' : bigint,
  'w_hex' : string,
}
export interface HexCiphertext { 'c1_hex' : string, 'c2_hex' : string }
export interface HexDisjunctiveRangeProof {
  'c1_hex' : string,
  'b0_hex' : string,
  'a1_hex' : string,
  's1_hex' : string,
  'c0_hex' : string,
  'b1_hex' : string,
  'a0_hex' : string,
  's0_hex' : string,
}
export type ResultNat64 = { 'Ok' : bigint } |
  { 'Err' : string };
export type ResultTally = { 'Ok' : EncryptedTally } |
  { 'Err' : string };
export type ResultText = { 'Ok' : string } |
  { 'Err' : string };
export interface _SERVICE {
  'cast_ballot' : ActorMethod<[Ballot], ResultText>,
  'close_voting' : ActorMethod<[], ResultText>,
  'create_election' : ActorMethod<[string, string, bigint, bigint], ResultText>,
  'get_election_details' : ActorMethod<[], ElectionDetails>,
  'get_encrypted_tally' : ActorMethod<[], ResultTally>,
  'has_nullifier_been_used' : ActorMethod<[Uint8Array | number[]], boolean>,
  'is_voter_registered' : ActorMethod<[Principal], boolean>,
  'open_voting' : ActorMethod<[], ResultText>,
  'register_voters' : ActorMethod<[Array<Principal>], ResultNat64>,
  'submit_decryption_proof' : ActorMethod<[HexChaumPedersenProof], ResultNat64>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
