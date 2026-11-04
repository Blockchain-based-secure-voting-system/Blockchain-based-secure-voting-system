import type {
  ElectionDetails,
  EncryptedTally,
  HexChaumPedersenProof,
  HexCiphertext,
  HexDisjunctiveRangeProof,
  VoterLoginResponse,
  BallotReceiptResponse,
  BulletinLogResponse,
} from '../types/election';
import { Principal } from '../types/principal';

export function resolveConfiguredApiUrl(): string {
  const envMeta =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string | undefined> }).env) ||
    {};
  const fromEnv =
    (typeof process !== 'undefined' ? process?.env?.VITE_API_URL : undefined) ||
    envMeta.VITE_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim().replace(/\/+$/, '');
  }
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return 'http://127.0.0.1:8080';
  }
  return 'https://voting-system-api-wi7q.onrender.com';
}

export class ElectionApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || resolveConfiguredApiUrl();
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  private async fetchJson<T>(
    path: string,
    init: RequestInit = {},
    timeoutMs = 15000
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP error ${res.status}`);
      }

      return (await res.json()) as T;
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        throw new Error('Server request timed out. Backend may be experiencing cold start (~60s).');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async getElection(): Promise<ElectionDetails | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/election`);
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
        final_tally:
          data.final_tally !== null && data.final_tally !== undefined
            ? [BigInt(data.final_tally)]
            : [],
        proof_verified: data.proof_verified ?? false,
      };
    } catch (err) {
      throw err;
    }
  }

  async getEncryptedTally(): Promise<EncryptedTally | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/tally`);
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
  }

  async voterLogin(credentialCode: string): Promise<VoterLoginResponse> {
    return this.fetchJson<VoterLoginResponse>('/api/v1/voter/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential_code: credentialCode.trim() }),
    });
  }

  async castBallot(
    payload: {
      nullifier_hex: string;
      ciphertext: HexCiphertext;
      range_proof: HexDisjunctiveRangeProof;
    },
    sessionToken?: string
  ): Promise<BallotReceiptResponse> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    return this.fetchJson<BallotReceiptResponse>('/api/v1/ballots', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  }

  async getBulletin(): Promise<BulletinLogResponse> {
    return this.fetchJson<BulletinLogResponse>('/api/v1/bulletin');
  }

  async hasNullifierBeenUsed(nullifierHex: string): Promise<boolean> {
    try {
      const rawHex = nullifierHex.trim().replace(/^0x/i, '').toLowerCase();
      const bulletin = await this.getBulletin();
      return bulletin.entries.some(
        (e) => e.nullifier_hex.replace(/^0x/i, '').toLowerCase() === rawHex
      );
    } catch {
      return false;
    }
  }

  // Administrator Endpoints
  async createElection(
    title: string,
    trusteePkHex: string,
    startTime: bigint,
    endTime: bigint,
    adminToken: string
  ): Promise<string> {
    await this.fetchJson('/api/v1/admin/election', {
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
    return 'Election created successfully';
  }

  async issueCredentials(count: number, adminToken: string): Promise<string[]> {
    const res = await this.fetchJson<{ credentials: string[]; count_issued: number }>(
      '/api/v1/admin/credentials',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ count }),
      }
    );
    return res.credentials;
  }

  async openVoting(adminToken: string): Promise<string> {
    await this.fetchJson('/api/v1/admin/open-voting', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    return 'Voting opened successfully';
  }

  async closeVoting(adminToken: string): Promise<string> {
    await this.fetchJson('/api/v1/admin/close-voting', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    return 'Voting closed successfully';
  }

  async finalizeTally(proof: HexChaumPedersenProof, adminToken: string): Promise<bigint> {
    const res = await this.fetchJson<{ final_tally: number }>(
      '/api/v1/admin/finalize-tally',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ proof }),
      }
    );
    return BigInt(res.final_tally);
  }
}

export const defaultApiClient = new ElectionApiClient();
