export const idlFactory = ({ IDL }) => {
  const ElectionPhase = IDL.Variant({
    'Setup': IDL.Null,
    'Voting': IDL.Null,
    'Tallying': IDL.Null,
    'Complete': IDL.Null,
  });

  const HexCiphertext = IDL.Record({
    'c1_hex': IDL.Text,
    'c2_hex': IDL.Text,
  });

  const HexDisjunctiveRangeProof = IDL.Record({
    'a0_hex': IDL.Text,
    'b0_hex': IDL.Text,
    'a1_hex': IDL.Text,
    'b1_hex': IDL.Text,
    'c0_hex': IDL.Text,
    'c1_hex': IDL.Text,
    's0_hex': IDL.Text,
    's1_hex': IDL.Text,
  });

  const Ballot = IDL.Record({
    'nullifier': IDL.Vec(IDL.Nat8),
    'ciphertext': HexCiphertext,
    'range_proof': HexDisjunctiveRangeProof,
  });

  const EncryptedTally = IDL.Record({
    'c1_hex': IDL.Text,
    'c2_hex': IDL.Text,
    'total_ballots': IDL.Nat64,
  });

  const ElectionDetails = IDL.Record({
    'title': IDL.Text,
    'admin': IDL.Principal,
    'trustee_pk_hex': IDL.Text,
    'phase': ElectionPhase,
    'start_time': IDL.Nat64,
    'end_time': IDL.Nat64,
    'registered_voters_count': IDL.Nat64,
    'total_ballots_cast': IDL.Nat64,
    'final_tally': IDL.Opt(IDL.Nat64),
    'proof_verified': IDL.Bool,
  });

  const HexChaumPedersenProof = IDL.Record({
    'a_hex': IDL.Text,
    'b_hex': IDL.Text,
    's_hex': IDL.Text,
    'w_hex': IDL.Text,
    'decrypted_tally': IDL.Nat64,
  });

  const ResultText = IDL.Variant({ 'Ok': IDL.Text, 'Err': IDL.Text });
  const ResultNat64 = IDL.Variant({ 'Ok': IDL.Nat64, 'Err': IDL.Text });
  const ResultTally = IDL.Variant({ 'Ok': EncryptedTally, 'Err': IDL.Text });

  return IDL.Service({
    'create_election': IDL.Func([IDL.Text, IDL.Text, IDL.Nat64, IDL.Nat64], [ResultText], []),
    'register_voters': IDL.Func([IDL.Vec(IDL.Principal)], [ResultNat64], []),
    'open_voting': IDL.Func([], [ResultText], []),
    'cast_ballot': IDL.Func([Ballot], [ResultText], []),
    'close_voting': IDL.Func([], [ResultText], []),
    'submit_decryption_proof': IDL.Func([HexChaumPedersenProof], [ResultNat64], []),
    'get_election_details': IDL.Func([], [ElectionDetails], ['query']),
    'get_encrypted_tally': IDL.Func([], [ResultTally], ['query']),
    'is_voter_registered': IDL.Func([IDL.Principal], [IDL.Bool], ['query']),
    'has_nullifier_been_used': IDL.Func([IDL.Vec(IDL.Nat8)], [IDL.Bool], ['query']),
  });
};

export const init = ({ IDL: _IDL }) => { return []; };
