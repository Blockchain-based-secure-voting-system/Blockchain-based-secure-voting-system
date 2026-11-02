import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PHASE_VOCABULARY,
  formatCanisterTime,
  isVotingDeadlineExpiredButPhaseOpen,
} from '../src/content/errors';

const ROOT_DIR = path.resolve(__dirname, '../..');
const OPENAPI_PATH = path.join(ROOT_DIR, 'docs/openapi.json');
const USE_CANISTER_PATH = path.join(ROOT_DIR, 'frontend/src/hooks/useCanister.ts');

describe('Part 1: Backend Alignment & REST API Specification Suite', () => {
  it('verifies docs/openapi.json exists and contains all required Axum REST endpoints', () => {
    expect(fs.existsSync(OPENAPI_PATH)).toBe(true);
    const spec = JSON.parse(fs.readFileSync(OPENAPI_PATH, 'utf8'));

    const expectedPaths = [
      '/healthz',
      '/api/v1/election',
      '/api/v1/admin/election',
      '/api/v1/admin/credentials',
      '/api/v1/admin/open-voting',
      '/api/v1/admin/close-voting',
      '/api/v1/voter/login',
      '/api/v1/ballots',
      '/api/v1/bulletin',
      '/api/v1/tally',
      '/api/v1/admin/finalize-tally',
    ];

    for (const p of expectedPaths) {
      expect(spec.paths[p], `Missing route ${p} in docs/openapi.json`).toBeDefined();
    }
  });

  it('verifies useCanister.ts client wrapper exposes matching typed functions for API lifecycle', () => {
    const useCanisterSource = fs.readFileSync(USE_CANISTER_PATH, 'utf8');

    const expectedMethods = [
      'createElection',
      'registerVoters',
      'openVoting',
      'castBallot',
      'closeVoting',
      'submitDecryptionProof',
      'hasNullifierBeenUsed',
      'getElectionDetails',
      'getEncryptedTally',
    ];

    for (const method of expectedMethods) {
      expect(
        useCanisterSource,
        `useCanister.ts must declare '${method}' in UseCanisterReturn`
      ).toMatch(new RegExp(`\\b${method}\\s*:`));
    }
  });

  it('verifies every ElectionPhase is defined in PHASE_VOCABULARY', () => {
    const expectedPhases = ['Setup', 'Voting', 'Tallying', 'Complete'];
    for (const phase of expectedPhases) {
      expect(
        PHASE_VOCABULARY[phase as keyof typeof PHASE_VOCABULARY],
        `Missing ElectionPhase '${phase}' in PHASE_VOCABULARY`
      ).toBeDefined();
    }
  });

  it('formats nanosecond and second server timestamps in local time with UTC details and detects expired voting windows', () => {
    // 2026-10-31T12:00:00Z in Unix seconds
    const secTimestamp = 1793448000n;
    const formatted = formatCanisterTime(secTimestamp);
    expect(formatted.isSet).toBe(true);
    expect(formatted.utcFormatted).toBe('2026-10-31 12:00:00 UTC');
    expect(formatted.localFormatted.length).toBeGreaterThan(5);

    const zeroFormatted = formatCanisterTime(0n);
    expect(zeroFormatted.isSet).toBe(false);
    expect(zeroFormatted.localFormatted).toContain('No time limit configured');

    // Expired deadline while phase is still Voting
    const pastEndSec = BigInt(Math.floor(Date.now() / 1000) - 60);
    const futureEndSec = BigInt(Math.floor(Date.now() / 1000) + 60);

    expect(isVotingDeadlineExpiredButPhaseOpen({ Voting: null }, pastEndSec)).toBe(true);
    expect(isVotingDeadlineExpiredButPhaseOpen({ Voting: null }, futureEndSec)).toBe(false);
    expect(isVotingDeadlineExpiredButPhaseOpen({ Tallying: null }, pastEndSec)).toBe(false);
    expect(isVotingDeadlineExpiredButPhaseOpen({ Setup: null }, pastEndSec)).toBe(false);
  });
});
