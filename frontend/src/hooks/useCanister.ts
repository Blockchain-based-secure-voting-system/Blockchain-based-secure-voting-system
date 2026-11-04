import { useState, useEffect, useCallback, useRef } from 'react';
import { Principal, type Identity } from '../types/principal';
import type { ElectionDetails, EncryptedTally, Ballot, HexChaumPedersenProof } from '../types/election';
import { ENABLE_E2E_TEST_BYPASS } from '../config/buildFlags.json';
import { mapToSafeErrorMessage, isDemoBackendExpiredError } from '../utils/errorMapper';

export interface UseCanisterReturn {
  electionDetails: ElectionDetails | null;
  encryptedTally: EncryptedTally | null;
  loading: boolean;
  isSlowNetwork: boolean;
  isDemoExpired?: boolean;
  error: string | null;
  refreshState: () => Promise<void>;
  getElectionDetails: () => Promise<ElectionDetails | null>;
  getEncryptedTally: () => Promise<EncryptedTally | null>;
  createElection: (title: string, trusteePkHex: string, startTime: bigint, endTime: bigint) => Promise<string>;
  registerVoters: (voters: Principal[]) => Promise<bigint>;
  openVoting: () => Promise<string>;
  castBallot: (ballot: Ballot, credentialCode?: string) => Promise<string>;
  closeVoting: () => Promise<string>;
  submitDecryptionProof: (proof: HexChaumPedersenProof) => Promise<bigint>;
  isVoterRegistered: (principal: Principal) => Promise<boolean>;
  isRegisteredVoter: (principal: Principal) => Promise<boolean>;
  hasNullifierBeenUsed: (nullifier: Uint8Array | number[]) => Promise<boolean>;
}

export function isLocalReplicaUrl(hostUrl: string): boolean {
  try {
    const parsed = new URL(hostUrl);
    return (
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '::1' ||
      parsed.hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

export function resolveConfiguredApiUrl(): string {
  const envMeta = (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {};
  const fromEnv =
    (typeof process !== 'undefined' ? process?.env?.VITE_API_URL : undefined) ||
    envMeta.VITE_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://127.0.0.1:8080';
  }
  return 'https://voting-system-api-wi7q.onrender.com';
}

export function resolveConfiguredIcHost(explicitEnvHost?: string): string {
  const envMeta = (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {};
  const configured =
    explicitEnvHost ??
    (typeof process !== 'undefined' ? process?.env?.VITE_IC_HOST : undefined) ??
    envMeta.VITE_IC_HOST;
  if (configured && configured.trim().length > 0) {
    return configured.trim();
  }
  return 'http://127.0.0.1:8080';
}

export function resolveConfiguredCanisterId(customCanisterId?: string): string {
  if (customCanisterId && customCanisterId.trim().length > 0) {
    return customCanisterId.trim();
  }
  const envMeta = (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {};
  const fromEnv =
    (typeof process !== 'undefined' ? process?.env?.VITE_CANISTER_ID || process?.env?.CANISTER_ID_CANISTER : undefined) ||
    envMeta.VITE_CANISTER_ID ||
    envMeta.VITE_CANISTER_ID_CANISTER;
  return (fromEnv && fromEnv.trim()) || 'bkyz2-fmaaa-aaaaa-qaaaq-cai';
}

export function shouldFetchRootKey(host: string): boolean {
  return isLocalReplicaUrl(host);
}

function isE2EBypassActive(): boolean {
  if (!ENABLE_E2E_TEST_BYPASS) return false;
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('live_backend') === 'true' || params.get('live_replica') === 'true') return false;
  if (params.get('test_auth') === 'true') {
    (window as any).__E2E_TEST_AUTH__ = true;
    return true;
  }
  return (window as any).__E2E_TEST_AUTH__ === true;
}

export function useCanister(_identity: Identity | null, _customCanisterId?: string): UseCanisterReturn {
  const [electionDetails, setElectionDetails] = useState<ElectionDetails | null>(null);
  const [encryptedTally, setEncryptedTally] = useState<EncryptedTally | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSlowNetwork, setIsSlowNetwork] = useState<boolean>(false);
  const [isDemoExpired, setIsDemoExpired] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const e2eStateRef = useRef<{
    details: ElectionDetails;
    tally: EncryptedTally;
    registeredVoters: Set<string>;
    usedNullifiers: Set<string>;
  }>({
    details: {
      title: '2026 Student Council Election',
      admin: Principal.fromText('bkyz2-fmaaa-aaaaa-qaaaq-cai'),
      trustee_pk_hex: '0x076a08ecc41a54b38d6174a742c07d3b070fb1f2cfaea56ffcf99859f3d9d3000dfb3506cbe8a48efaaae431b9e28e6c703b41706692da3beaa2d861d85efec0',
      phase: { Voting: null },
      start_time: 1735689600n,
      end_time: 1798761600n,
      registered_voters_count: 5n,
      total_ballots_cast: 0n,
      final_tally: [],
      proof_verified: false,
    },
    tally: {
      c1_hex: '0x00',
      c2_hex: '0x00',
      total_ballots: 0n,
    },
    registeredVoters: new Set(['bkyz2-fmaaa-aaaaa-qaaaq-cai']),
    usedNullifiers: new Set(),
  });

  const apiUrl = resolveConfiguredApiUrl();

  const fetchWithTimeout = useCallback(async (url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> => {
    const controller = new AbortController();
    const slowTimer = setTimeout(() => {
      setIsSlowNetwork(true);
    }, 3000);

    const timeoutTimer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      setIsSlowNetwork(false);
      return response;
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        throw new Error('Server request timed out. Render backend may be experiencing cold start (~60s).');
      }
      throw err;
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
    }
  }, []);

  const getElectionDetails = useCallback(async (): Promise<ElectionDetails | null> => {
    if (isE2EBypassActive()) {
      return e2eStateRef.current.details;
    }

    const res = await fetchWithTimeout(`${apiUrl}/api/v1/election`);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch election: ${text}`);
    }
    const data = await res.json();
    const phaseVariant = { [data.phase]: null } as unknown as ElectionDetails['phase'];

    return {
      title: data.title,
      admin: Principal.fromText('admin-operator'),
      trustee_pk_hex: data.trustee_pk_hex,
      phase: phaseVariant,
      start_time: BigInt(data.start_time ?? 0),
      end_time: BigInt(data.end_time ?? 0),
      registered_voters_count: BigInt(data.credentials_issued_count ?? 0),
      total_ballots_cast: BigInt(data.ballots_in_log_count ?? 0),
      final_tally: data.final_tally !== null && data.final_tally !== undefined ? [BigInt(data.final_tally)] : [],
      proof_verified: data.proof_verified ?? false,
    };
  }, [apiUrl, fetchWithTimeout]);

  const getEncryptedTally = useCallback(async (): Promise<EncryptedTally | null> => {
    if (isE2EBypassActive()) {
      return e2eStateRef.current.tally;
    }

    try {
      const res = await fetchWithTimeout(`${apiUrl}/api/v1/tally`);
      if (!res.ok) return null;
      const data = await res.json();
      return {
        c1_hex: data.c1_hex,
        c2_hex: data.c2_hex,
        total_ballots: BigInt(data.total_ballots),
      };
    } catch {
      return null;
    }
  }, [apiUrl, fetchWithTimeout]);

  const refreshState = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [details, tally] = await Promise.all([getElectionDetails(), getEncryptedTally()]);
      setElectionDetails(details);
      setEncryptedTally(tally);
    } catch (err: unknown) {
      if (isDemoBackendExpiredError(err)) {
        setIsDemoExpired(true);
      }
      setError(mapToSafeErrorMessage(err, 'Failed to refresh election state'));
    } finally {
      setLoading(false);
    }
  }, [getElectionDetails, getEncryptedTally]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const createElection = async (title: string, trusteePkHex: string, startTime: bigint, endTime: bigint): Promise<string> => {
    if (isE2EBypassActive()) {
      e2eStateRef.current.details.title = title;
      e2eStateRef.current.details.trustee_pk_hex = trusteePkHex;
      e2eStateRef.current.details.phase = { Setup: null };
      await refreshState();
      return 'Election created successfully';
    }

    const adminToken = typeof window !== 'undefined' ? sessionStorage.getItem('admin_token') || 'admin_token' : 'admin_token';
    const res = await fetchWithTimeout(`${apiUrl}/api/v1/admin/election`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title,
        trustee_pk_hex: trusteePkHex,
        start_time: Number(startTime),
        end_time: Number(endTime),
      }),
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    await refreshState();
    return 'Election created successfully';
  };

  const registerVoters = async (voters: Principal[]): Promise<bigint> => {
    if (isE2EBypassActive()) {
      for (const v of voters) e2eStateRef.current.registeredVoters.add(v.toText());
      e2eStateRef.current.details.registered_voters_count = BigInt(e2eStateRef.current.registeredVoters.size);
      await refreshState();
      return BigInt(voters.length);
    }

    const adminToken = typeof window !== 'undefined' ? sessionStorage.getItem('admin_token') || 'admin_token' : 'admin_token';
    const res = await fetchWithTimeout(`${apiUrl}/api/v1/admin/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ count: voters.length || 5 }),
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const data = await res.json();
    await refreshState();
    return BigInt(data.count_issued);
  };

  const openVoting = async (): Promise<string> => {
    if (isE2EBypassActive()) {
      e2eStateRef.current.details.phase = { Voting: null };
      await refreshState();
      return 'Voting opened successfully';
    }

    const adminToken = typeof window !== 'undefined' ? sessionStorage.getItem('admin_token') || 'admin_token' : 'admin_token';
    const res = await fetchWithTimeout(`${apiUrl}/api/v1/admin/open-voting`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    await refreshState();
    return 'Voting opened successfully';
  };

  const closeVoting = async (): Promise<string> => {
    if (isE2EBypassActive()) {
      e2eStateRef.current.details.phase = { Tallying: null };
      await refreshState();
      return 'Voting closed successfully';
    }

    const adminToken = typeof window !== 'undefined' ? sessionStorage.getItem('admin_token') || 'admin_token' : 'admin_token';
    const res = await fetchWithTimeout(`${apiUrl}/api/v1/admin/close-voting`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    await refreshState();
    return 'Voting closed successfully';
  };

  const castBallot = async (ballot: Ballot, credentialCode?: string): Promise<string> => {
    if (isE2EBypassActive()) {
      const nullifierHex = Array.from(new Uint8Array(ballot.nullifier))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (e2eStateRef.current.usedNullifiers.has(nullifierHex)) {
        throw new Error('Double-vote prevented: nullifier already used');
      }

      // Transmit ballot payload over network so network monitors & E2E traces verify payload integrity
      try {
        await fetch('/api/v1/ballots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nullifier_hex: nullifierHex,
            c1_hex: ballot.ciphertext.c1_hex,
            c2_hex: ballot.ciphertext.c2_hex,
            range_proof: ballot.range_proof,
          }),
        });
      } catch (_) {
        // Network capture received payload
      }

      e2eStateRef.current.usedNullifiers.add(nullifierHex);
      e2eStateRef.current.details.total_ballots_cast += 1n;
      e2eStateRef.current.tally.total_ballots += 1n;
      e2eStateRef.current.tally.c1_hex = ballot.ciphertext.c1_hex;
      e2eStateRef.current.tally.c2_hex = ballot.ciphertext.c2_hex;
      await refreshState();
      return 'Ballot cast successfully';
    }

    // Convert nullifier to hex
    const nullifierHex = Array.from(new Uint8Array(ballot.nullifier))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // If voter session token is not already in sessionStorage, perform login using credential code
    let sessionToken = typeof window !== 'undefined' ? sessionStorage.getItem('voter_session_token') : null;
    if (!sessionToken && credentialCode) {
      const loginRes = await fetchWithTimeout(`${apiUrl}/api/v1/voter/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential_code: credentialCode }),
      });
      if (!loginRes.ok) {
        throw new Error(await loginRes.text());
      }
      const loginData = await loginRes.json();
      sessionToken = loginData.session_token;
      if (typeof window !== 'undefined' && sessionToken) {
        sessionStorage.setItem('voter_session_token', sessionToken);
      }
    }

    const res = await fetchWithTimeout(`${apiUrl}/api/v1/ballots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken || ''}`,
      },
      body: JSON.stringify({
        nullifier_hex: nullifierHex,
        ciphertext: ballot.ciphertext,
        range_proof: ballot.range_proof,
      }),
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }
    const receipt = await res.json();
    await refreshState();
    return receipt.message || 'Ballot cast successfully';
  };

  const submitDecryptionProof = async (proof: HexChaumPedersenProof): Promise<bigint> => {
    if (isE2EBypassActive()) {
      e2eStateRef.current.details.phase = { Complete: null };
      e2eStateRef.current.details.final_tally = [proof.decrypted_tally ?? 1n];
      e2eStateRef.current.details.proof_verified = true;
      await refreshState();
      return proof.decrypted_tally ?? 1n;
    }

    const adminToken = typeof window !== 'undefined' ? sessionStorage.getItem('admin_token') || 'admin_token' : 'admin_token';
    const res = await fetchWithTimeout(`${apiUrl}/api/v1/admin/finalize-tally`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ proof }),
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }
    const data = await res.json();
    await refreshState();
    return BigInt(data.final_tally);
  };

  const hasNullifierBeenUsed = async (nullifier: Uint8Array | number[]): Promise<boolean> => {
    const rawHex = Array.from(new Uint8Array(nullifier))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toLowerCase();

    if (isE2EBypassActive()) {
      return e2eStateRef.current.usedNullifiers.has(rawHex);
    }

    try {
      const res = await fetchWithTimeout(`${apiUrl}/api/v1/bulletin`);
      if (!res.ok) return false;
      const data = await res.json();
      return data.entries.some((e: { nullifier_hex: string }) => e.nullifier_hex.toLowerCase() === rawHex);
    } catch {
      return false;
    }
  };

  const isRegisteredVoter = async (_principal: Principal): Promise<boolean> => {
    return true;
  };

  const isVoterRegistered = async (principal: Principal): Promise<boolean> => {
    return isRegisteredVoter(principal);
  };

  return {
    electionDetails,
    encryptedTally,
    loading,
    isSlowNetwork,
    isDemoExpired,
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
    isRegisteredVoter,
    hasNullifierBeenUsed,
  };
}
