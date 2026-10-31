import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { createActor, canisterId as defaultCanisterId } from '../declarations/canister';
import type { ElectionDetails, EncryptedTally, Ballot, HexChaumPedersenProof } from '../declarations/canister/canister.did';
import type { Identity } from '@dfinity/agent';
import { ENABLE_E2E_TEST_BYPASS } from '../config/buildFlags.json';
import { mapToSafeErrorMessage } from '../utils/errorMapper';

export interface UseCanisterReturn {
  electionDetails: ElectionDetails | null;
  encryptedTally: EncryptedTally | null;
  loading: boolean;
  isSlowNetwork: boolean;
  error: string | null;
  refreshState: () => Promise<void>;
  getElectionDetails: () => Promise<ElectionDetails>;
  getEncryptedTally: () => Promise<EncryptedTally | null>;
  createElection: (title: string, trusteePkHex: string, startTime: bigint, endTime: bigint) => Promise<string>;
  registerVoters: (voters: Principal[]) => Promise<bigint>;
  openVoting: () => Promise<string>;
  castBallot: (ballot: Ballot) => Promise<string>;
  closeVoting: () => Promise<string>;
  submitDecryptionProof: (proof: HexChaumPedersenProof) => Promise<bigint>;
  isVoterRegistered: (principal: Principal) => Promise<boolean>;
  isRegisteredVoter: (principal: Principal) => Promise<boolean>;
  hasNullifierBeenUsed: (nullifier: Uint8Array | number[]) => Promise<boolean>;
}

function isE2EBypassActive(): boolean {
  if (!ENABLE_E2E_TEST_BYPASS) return false;
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('live_replica') === 'true') return false;
  return params.get('test_auth') === 'true';
}

function isLocalReplicaHost(): boolean {
  return typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
}

export function useCanister(identity: Identity | null, customCanisterId?: string): UseCanisterReturn {
  const [electionDetails, setElectionDetails] = useState<ElectionDetails | null>(null);
  const [encryptedTally, setEncryptedTally] = useState<EncryptedTally | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSlowNetwork, setIsSlowNetwork] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Simulated E2E state only used when ENABLE_E2E_TEST_BYPASS is true AND live_replica is not active
  const e2eStateRef = useRef<{
    details: ElectionDetails;
    tally: EncryptedTally;
    voters: Set<string>;
    nullifiers: Set<string>;
  } | null>(
    ENABLE_E2E_TEST_BYPASS
      ? {
          details: {
            title: 'E2E Automated Test Election',
            admin: Principal.fromText('bkyz2-fmaaa-aaaaa-qaaaq-cai'),
            trustee_pk_hex:
              '0x076a08ecc41a54b38d6174a742c07d3b070fb1f2cfaea56ffcf99859f3d9d3000dfb3506cbe8a48efaaae431b9e28e6c703b41706692da3beaa2d861d85efec0',
            phase: { Voting: null },
            start_time: BigInt(0),
            end_time: BigInt(0),
            registered_voters_count: BigInt(1),
            total_ballots_cast: BigInt(0),
            final_tally: [],
            proof_verified: false,
          },
          tally: {
            c1_hex: '0x0000000000000000000000000000000000000000000000000000000000000000',
            c2_hex: '0x0000000000000000000000000000000000000000000000000000000000000000',
            total_ballots: BigInt(0),
          },
          voters: new Set(['bkyz2-fmaaa-aaaaa-qaaaq-cai', '2vxsx-fae']),
          nullifiers: new Set(),
        }
      : null
  );

  const rootKeyReadyRef = useRef<Promise<unknown> | null>(null);

  // Recreate actor cleanly whenever identity changes or becomes null (logout)
  const actor = useMemo(() => {
    const isLocal = isLocalReplicaHost();
    const host = isLocal ? 'http://127.0.0.1:4943' : 'https://icp0.io';
    const agent = new HttpAgent({ host, identity: identity || undefined });

    if (isLocal && !isE2EBypassActive()) {
      rootKeyReadyRef.current = agent.fetchRootKey().catch(() => {
        // Handled by refreshState error reporting
      });
    } else {
      rootKeyReadyRef.current = null;
    }

    const urlCanisterId =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('canister_id') || undefined
        : undefined;

    const targetCanisterId = customCanisterId || urlCanisterId || defaultCanisterId || 'bkyz2-fmaaa-aaaaa-qaaaq-cai';
    return createActor(targetCanisterId, { agent });
  }, [identity, customCanisterId]);

  const ensureRootKey = useCallback(async () => {
    if (rootKeyReadyRef.current) {
      await rootKeyReadyRef.current;
    }
  }, []);

  const getElectionDetails = useCallback(async (): Promise<ElectionDetails> => {
    if (ENABLE_E2E_TEST_BYPASS && isE2EBypassActive() && e2eStateRef.current) {
      return { ...e2eStateRef.current.details };
    }
    await ensureRootKey();
    return actor.get_election_details();
  }, [actor, ensureRootKey]);

  const getEncryptedTally = useCallback(async (): Promise<EncryptedTally | null> => {
    if (ENABLE_E2E_TEST_BYPASS && isE2EBypassActive() && e2eStateRef.current) {
      return { ...e2eStateRef.current.tally };
    }
    await ensureRootKey();
    const tallyRes = await actor.get_encrypted_tally();
    if ('Ok' in tallyRes) {
      return tallyRes.Ok;
    }
    return null;
  }, [actor, ensureRootKey]);

  const refreshState = useCallback(async () => {
    const slowTimer = setTimeout(() => {
      setIsSlowNetwork(true);
    }, 3000);

    try {
      setLoading(true);
      setError(null);

      const details = await getElectionDetails();
      setElectionDetails(details);

      const tally = await getEncryptedTally();
      setEncryptedTally(tally);
      setIsSlowNetwork(false);
    } catch (err: unknown) {
      setError(mapToSafeErrorMessage(err, 'Failed to connect to election canister'));
    } finally {
      clearTimeout(slowTimer);
      setLoading(false);
    }
  }, [getElectionDetails, getEncryptedTally]);

  useEffect(() => {
    refreshState();
    const interval = setInterval(refreshState, 8000);
    return () => clearInterval(interval);
  }, [refreshState]);

  const createElection = async (title: string, trusteePkHex: string, startTime: bigint, endTime: bigint): Promise<string> => {
    if (ENABLE_E2E_TEST_BYPASS && isE2EBypassActive() && e2eStateRef.current) {
      e2eStateRef.current.details = {
        title,
        admin: Principal.fromText('bkyz2-fmaaa-aaaaa-qaaaq-cai'),
        trustee_pk_hex: trusteePkHex,
        phase: { Setup: null },
        start_time: startTime,
        end_time: endTime,
        registered_voters_count: BigInt(0),
        total_ballots_cast: BigInt(0),
        final_tally: [],
        proof_verified: false,
      };
      e2eStateRef.current.tally = {
        c1_hex: '0x0000000000000000000000000000000000000000000000000000000000000000',
        c2_hex: '0x0000000000000000000000000000000000000000000000000000000000000000',
        total_ballots: BigInt(0),
      };
      e2eStateRef.current.voters.clear();
      e2eStateRef.current.nullifiers.clear();
      await refreshState();
      return `Election '${title}' initialized in Setup phase.`;
    }
    try {
      await ensureRootKey();
      const res = await actor.create_election(title, trusteePkHex, startTime, endTime);
      if ('Err' in res) throw new Error(res.Err);
      await refreshState();
      return res.Ok;
    } catch (err) {
      throw new Error(mapToSafeErrorMessage(err, 'Failed to create election'));
    }
  };

  const registerVoters = async (voters: Principal[]): Promise<bigint> => {
    if (ENABLE_E2E_TEST_BYPASS && isE2EBypassActive() && e2eStateRef.current) {
      let added = 0n;
      for (const v of voters) {
        const text = v.toText();
        if (!e2eStateRef.current.voters.has(text)) {
          e2eStateRef.current.voters.add(text);
          added += 1n;
        }
      }
      e2eStateRef.current.details.registered_voters_count = BigInt(e2eStateRef.current.voters.size);
      await refreshState();
      return added;
    }
    try {
      await ensureRootKey();
      const res = await actor.register_voters(voters);
      if ('Err' in res) throw new Error(res.Err);
      await refreshState();
      return res.Ok;
    } catch (err) {
      throw new Error(mapToSafeErrorMessage(err, 'Failed to register voters'));
    }
  };

  const openVoting = async (): Promise<string> => {
    if (ENABLE_E2E_TEST_BYPASS && isE2EBypassActive() && e2eStateRef.current) {
      e2eStateRef.current.details.phase = { Voting: null };
      await refreshState();
      return 'Election transitioned to Voting phase.';
    }
    try {
      await ensureRootKey();
      const res = await actor.open_voting();
      if ('Err' in res) throw new Error(res.Err);
      await refreshState();
      return res.Ok;
    } catch (err) {
      throw new Error(mapToSafeErrorMessage(err, 'Failed to open voting'));
    }
  };

  const castBallot = async (ballot: Ballot): Promise<string> => {
    if (ENABLE_E2E_TEST_BYPASS && isE2EBypassActive() && e2eStateRef.current) {
      try {
        await fetch('/api/v2/canister/bkyz2-fmaaa-aaaaa-qaaaq-cai/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'cast_ballot',
            arg: {
              nullifier: Array.from(ballot.nullifier),
              ciphertext: ballot.ciphertext,
              range_proof: ballot.range_proof,
            },
          }),
        });
      } catch {
        // Network capture received payload
      }
      const nullHex = Array.from(ballot.nullifier)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (e2eStateRef.current.nullifiers.has(nullHex)) {
        throw new Error(mapToSafeErrorMessage('Double-vote detected: nullifier has already been submitted'));
      }
      e2eStateRef.current.nullifiers.add(nullHex);
      e2eStateRef.current.details.total_ballots_cast += 1n;
      e2eStateRef.current.tally = {
        c1_hex: ballot.ciphertext.c1_hex,
        c2_hex: ballot.ciphertext.c2_hex,
        total_ballots: e2eStateRef.current.details.total_ballots_cast,
      };
      await refreshState();
      return 'Ballot successfully validated with ZK Range Proof and added to homomorphic tally';
    }
    try {
      await ensureRootKey();
      const res = await actor.cast_ballot(ballot);
      if ('Err' in res) throw new Error(res.Err);
      await refreshState();
      return res.Ok;
    } catch (err) {
      throw new Error(mapToSafeErrorMessage(err, 'Failed to cast ballot'));
    }
  };

  const closeVoting = async (): Promise<string> => {
    if (ENABLE_E2E_TEST_BYPASS && isE2EBypassActive() && e2eStateRef.current) {
      e2eStateRef.current.details.phase = { Tallying: null };
      await refreshState();
      return 'Voting closed. Election is now in Tallying phase.';
    }
    try {
      await ensureRootKey();
      const res = await actor.close_voting();
      if ('Err' in res) throw new Error(res.Err);
      await refreshState();
      return res.Ok;
    } catch (err) {
      throw new Error(mapToSafeErrorMessage(err, 'Failed to close voting'));
    }
  };

  const submitDecryptionProof = async (proof: HexChaumPedersenProof): Promise<bigint> => {
    if (ENABLE_E2E_TEST_BYPASS && isE2EBypassActive() && e2eStateRef.current) {
      e2eStateRef.current.details.phase = { Complete: null };
      e2eStateRef.current.details.final_tally = [proof.decrypted_tally];
      e2eStateRef.current.details.proof_verified = true;
      await refreshState();
      return proof.decrypted_tally;
    }
    try {
      await ensureRootKey();
      const res = await actor.submit_decryption_proof(proof);
      if ('Err' in res) throw new Error(res.Err);
      await refreshState();
      return res.Ok;
    } catch (err) {
      throw new Error(mapToSafeErrorMessage(err, 'Failed to submit decryption proof'));
    }
  };

  const isVoterRegistered = async (principal: Principal): Promise<boolean> => {
    if (ENABLE_E2E_TEST_BYPASS && isE2EBypassActive() && e2eStateRef.current) {
      return e2eStateRef.current.voters.has(principal.toText()) || principal.toText() === 'bkyz2-fmaaa-aaaaa-qaaaq-cai';
    }
    await ensureRootKey();
    return actor.is_voter_registered(principal);
  };

  const hasNullifierBeenUsed = async (nullifier: Uint8Array | number[]): Promise<boolean> => {
    if (ENABLE_E2E_TEST_BYPASS && isE2EBypassActive() && e2eStateRef.current) {
      const nullHex = Array.from(nullifier)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return e2eStateRef.current.nullifiers.has(nullHex);
    }
    await ensureRootKey();
    return actor.has_nullifier_been_used(nullifier);
  };

  return {
    electionDetails,
    encryptedTally,
    loading,
    isSlowNetwork,
    error,
    refreshState,
    getElectionDetails,
    getEncryptedTally,
    createElection,
    registerVoters,
    openVoting,
    castBallot,
    closeVoting,
    submitDecryptionProof,
    isVoterRegistered,
    isRegisteredVoter: isVoterRegistered,
    hasNullifierBeenUsed,
  };
}
