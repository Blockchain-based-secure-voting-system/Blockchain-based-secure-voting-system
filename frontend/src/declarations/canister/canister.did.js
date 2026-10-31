export const idlFactory = ({ IDL }) => {
  const HexDisjunctiveRangeProof = IDL.Record({
    'c1_hex' : IDL.Text,
    'b0_hex' : IDL.Text,
    'a1_hex' : IDL.Text,
    's1_hex' : IDL.Text,
    'c0_hex' : IDL.Text,
    'b1_hex' : IDL.Text,
    'a0_hex' : IDL.Text,
    's0_hex' : IDL.Text,
  });
  const HexCiphertext = IDL.Record({
    'c1_hex' : IDL.Text,
    'c2_hex' : IDL.Text,
  });
  const Ballot = IDL.Record({
    'range_proof' : HexDisjunctiveRangeProof,
    'ciphertext' : HexCiphertext,
    'nullifier' : IDL.Vec(IDL.Nat8),
  });
  const ResultText = IDL.Variant({ 'Ok' : IDL.Text, 'Err' : IDL.Text });
  const ElectionPhase = IDL.Variant({
    'Setup' : IDL.Null,
    'Tallying' : IDL.Null,
    'Complete' : IDL.Null,
    'Voting' : IDL.Null,
  });
  const ElectionDetails = IDL.Record({
    'title' : IDL.Text,
    'final_tally' : IDL.Opt(IDL.Nat64),
    'admin' : IDL.Principal,
    'trustee_pk_hex' : IDL.Text,
    'end_time' : IDL.Nat64,
    'total_ballots_cast' : IDL.Nat64,
    'start_time' : IDL.Nat64,
    'proof_verified' : IDL.Bool,
    'registered_voters_count' : IDL.Nat64,
    'phase' : ElectionPhase,
  });
  const EncryptedTally = IDL.Record({
    'c1_hex' : IDL.Text,
    'c2_hex' : IDL.Text,
    'total_ballots' : IDL.Nat64,
  });
  const ResultTally = IDL.Variant({ 'Ok' : EncryptedTally, 'Err' : IDL.Text });
  const ResultNat64 = IDL.Variant({ 'Ok' : IDL.Nat64, 'Err' : IDL.Text });
  const HexChaumPedersenProof = IDL.Record({
    'a_hex' : IDL.Text,
    's_hex' : IDL.Text,
    'b_hex' : IDL.Text,
    'decrypted_tally' : IDL.Nat64,
    'w_hex' : IDL.Text,
  });
  return IDL.Service({
    'cast_ballot' : IDL.Func([Ballot], [ResultText], []),
    'close_voting' : IDL.Func([], [ResultText], []),
    'create_election' : IDL.Func(
        [IDL.Text, IDL.Text, IDL.Nat64, IDL.Nat64],
        [ResultText],
        [],
      ),
    'get_election_details' : IDL.Func([], [ElectionDetails], ['query']),
    'get_encrypted_tally' : IDL.Func([], [ResultTally], ['query']),
    'has_nullifier_been_used' : IDL.Func(
        [IDL.Vec(IDL.Nat8)],
        [IDL.Bool],
        ['query'],
      ),
    'is_voter_registered' : IDL.Func([IDL.Principal], [IDL.Bool], ['query']),
    'open_voting' : IDL.Func([], [ResultText], []),
    'register_voters' : IDL.Func([IDL.Vec(IDL.Principal)], [ResultNat64], []),
    'submit_decryption_proof' : IDL.Func(
        [HexChaumPedersenProof],
        [ResultNat64],
        [],
      ),
  });
};
export const init = ({ IDL }) => { return []; };
