import { useState, useEffect, useCallback, useMemo } from 'react';
import { HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { createActor } from '../declarations/canister';
import type { ElectionDetails, EncryptedTally, Ballot, HexChaumPedersenProof } from '../declarations/canister/canister.did';
import type { Identity } from '@dfinity/agent';

export interface UseCanisterReturn {
  electionDetails: ElectionDetails | null;
  encryptedTally: EncryptedTally | null;
  loading: boolean;
  error: string | null;
  refreshState: () => Promise<void>;
  createElection: (title: string, trusteePkHex: string, startTime: bigint, endTime: bigint) => Promise<string>;
  registerVoters: (voters: Principal[]) => Promise<bigint>;
  openVoting: () => Promise<string>;
  castBallot: (ballot: Ballot) => Promise<string>;
  closeVoting: () => Promise<string>;
  submitDecryptionProof: (proof: HexChaumPedersenProof) => Promise<bigint>;
  isRegisteredVoter: (principal: Principal) => Promise<boolean>;
  hasNullifierBeenUsed: (nullifier: Uint8Array | number[]) => Promise<boolean>;
}

export function useCanister(identity: Identity | null, customCanisterId?: string): UseCanisterReturn {
  const [electionDetails, setElectionDetails] = useState<ElectionDetails | null>(null);
  const [encryptedTally, setEncryptedTally] = useState<EncryptedTally | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const actor = useMemo(() => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const host = isLocal ? 'http://127.0.0.1:4943' : 'https://icp0.io';
    const agent = new HttpAgent({ host, identity: identity || undefined });

    if (isLocal) {
      agent.fetchRootKey().catch(console.error);
    }

    return createActor(customCanisterId, { agent });
  }, [identity, customCanisterId]);

  const refreshState = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const details = await actor.get_election_details();
      setElectionDetails(details);

      const tallyRes = await actor.get_encrypted_tally();
      if ('Ok' in tallyRes) {
        setEncryptedTally(tallyRes.Ok);
      } else {
        setEncryptedTally(null);
      }
    } catch (err: any) {
      console.error('Error fetching election state:', err);
      setError(err?.message || 'Failed to connect to canister');
    } finally {
      setLoading(false);
    }
  }, [actor]);

  useEffect(() => {
    refreshState();
    const interval = setInterval(refreshState, 8000);
    return () => clearInterval(interval);
  }, [refreshState]);

  const createElection = async (title: string, trusteePkHex: string, startTime: bigint, endTime: bigint): Promise<string> => {
    const res = await actor.create_election(title, trusteePkHex, startTime, endTime);
    if ('Err' in res) throw new Error(res.Err);
    await refreshState();
    return res.Ok;
  };

  const registerVoters = async (voters: Principal[]): Promise<bigint> => {
    const res = await actor.register_voters(voters);
    if ('Err' in res) throw new Error(res.Err);
    await refreshState();
    return res.Ok;
  };

  const openVoting = async (): Promise<string> => {
    const res = await actor.open_voting();
    if ('Err' in res) throw new Error(res.Err);
    await refreshState();
    return res.Ok;
  };

  const castBallot = async (ballot: Ballot): Promise<string> => {
    const res = await actor.cast_ballot(ballot);
    if ('Err' in res) throw new Error(res.Err);
    await refreshState();
    return res.Ok;
  };

  const closeVoting = async (): Promise<string> => {
    const res = await actor.close_voting();
    if ('Err' in res) throw new Error(res.Err);
    await refreshState();
    return res.Ok;
  };

  const submitDecryptionProof = async (proof: HexChaumPedersenProof): Promise<bigint> => {
    const res = await actor.submit_decryption_proof(proof);
    if ('Err' in res) throw new Error(res.Err);
    await refreshState();
    return res.Ok;
  };

  const isRegisteredVoter = async (principal: Principal): Promise<boolean> => {
    return actor.is_voter_registered(principal);
  };

  const hasNullifierBeenUsed = async (nullifier: Uint8Array | number[]): Promise<boolean> => {
    return actor.has_nullifier_been_used(nullifier);
  };

  return {
    electionDetails,
    encryptedTally,
    loading,
    error,
    refreshState,
    createElection,
    registerVoters,
    openVoting,
    castBallot,
    closeVoting,
    submitDecryptionProof,
    isRegisteredVoter,
    hasNullifierBeenUsed,
  };
}
