import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import {
  validatePrincipalText,
  validatePrincipalList,
  validateHexString,
  validateElectionTitle,
  validateElectionId,
  validateTimestamps,
  validateThresholdBounds,
  validateAndParseTrusteeShares,
  validateTallyBound,
} from '../src/utils/validation';
import { mapToSafeErrorMessage } from '../src/utils/errorMapper';
import { DESIGN_TOKENS, getContrastRatio } from '../src/styles/tokens';
import { VoterView } from '../src/views/VoterView';
import { TrusteeView } from '../src/views/TrusteeView';
import type { UseCanisterReturn } from '../src/hooks/useCanister';
import type { AuthContextType } from '../src/hooks/useAuth';
import { Principal } from '../src/types/principal';

describe('Boundary Input Validation Helpers', () => {
  it('validates Principal IDs and rejects malformed strings', () => {
    expect(validatePrincipalText('2vxsx-fae').valid).toBe(true);
    expect(validatePrincipalText('bkyz2-fmaaa-aaaaa-qaaaq-cai').valid).toBe(true);
    expect(validatePrincipalText('').valid).toBe(false);
    expect(validatePrincipalText('not-a-valid-principal-id!!!').valid).toBe(false);

    const listRes = validatePrincipalList('2vxsx-fae\nbkyz2-fmaaa-aaaaa-qaaaq-cai');
    expect(listRes.valid).toBe(true);
    expect(listRes.principals).toHaveLength(2);

    const badListRes = validatePrincipalList('2vxsx-fae\ninvalid_principal');
    expect(badListRes.valid).toBe(false);
    expect(badListRes.error).toContain('Line 2');
  });

  it('validates hex strings (charset, even length, and byte bounds)', () => {
    expect(validateHexString('0x01020304', 'TestField', 4, 8).valid).toBe(true);
    expect(validateHexString('0x0102', 'TestField', 4, 8).valid).toBe(false);
    expect(validateHexString('0x01023', 'TestField', 1, 8).valid).toBe(false);
    expect(validateHexString('0xZZZZ', 'TestField', 1, 8).valid).toBe(false);
  });

  it('validates election title, election ID, timestamps, threshold bounds, share indices, and tally bounds', () => {
    expect(validateElectionTitle('2026 Municipal Referendum').valid).toBe(true);
    expect(validateElectionTitle('ab').valid).toBe(false);

    expect(validateElectionId('icp_election_2026').valid).toBe(true);
    expect(validateElectionId('bad id with spaces!').valid).toBe(false);

    expect(validateTimestamps(100n, 200n).valid).toBe(true);
    expect(validateTimestamps(200n, 100n).valid).toBe(false);

    expect(validateThresholdBounds(3, 5).valid).toBe(true);
    expect(validateThresholdBounds(6, 5).valid).toBe(false);
    expect(validateThresholdBounds(1, 5).valid).toBe(false);

    const sharesOk = validateAndParseTrusteeShares('1:0x1234\n3:0x5678\n5:0x9abc', 3);
    expect(sharesOk.valid).toBe(true);
    expect(sharesOk.shares).toHaveLength(3);

    const sharesDup = validateAndParseTrusteeShares('1:0x1234\n1:0x5678', 2);
    expect(sharesDup.valid).toBe(false);
    expect(sharesDup.error).toContain('Duplicate share index');

    expect(validateTallyBound(10000).valid).toBe(true);
    expect(validateTallyBound(0).valid).toBe(false);
    expect(validateTallyBound(5_000_000).valid).toBe(false);
  });
});

describe('Safe Error Mapping (Zero Secret / Stack Trace Leakage)', () => {
  it('maps canister, network, and wasm errors to safe messages and strips long hex secrets & stack frames', () => {
    const rawWithSecret = new Error(
      'Decryption error with secret 0x99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa\n    at Object.decrypt (file:///internal/path.js:12:34)'
    );
    const mapped = mapToSafeErrorMessage(rawWithSecret, 'Decryption failed');
    expect(mapped).not.toContain('99887766554433221100ffeeddccbbaa');
    expect(mapped).not.toContain('file:///internal/path.js');
    expect(mapped).toContain('[REDACTED_HEX]');

    expect(mapToSafeErrorMessage(new Error('TypeError: Failed to fetch'))).toContain(
      'Cannot reach the election canister'
    );
    expect(mapToSafeErrorMessage(new Error('Double-vote detected for nullifier'))).toContain(
      'Double-vote prevented'
    );
  });
});

describe('Voter & Trustee Secret-Clearing Behavior (Unmount & Pagehide)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clears voter secret passphrase on pagehide and unmount', () => {
    const mockCanister: UseCanisterReturn = {
      electionDetails: {
        title: 'Test Election',
        admin: Principal.fromText('2vxsx-fae'),
        trustee_pk_hex:
          '0x076a08ecc41a54b38d6174a742c07d3b070fb1f2cfaea56ffcf99859f3d9d3000dfb3506cbe8a48efaaae431b9e28e6c703b41706692da3beaa2d861d85efec0',
        phase: { Voting: null },
        start_time: 0n,
        end_time: 0n,
        registered_voters_count: 5n,
        total_ballots_cast: 0n,
        final_tally: [],
        proof_verified: false,
      },
      encryptedTally: null,
      loading: false,
      isSlowNetwork: false,
      error: null,
      refreshState: vi.fn(),
      getElectionDetails: vi.fn(),
      getEncryptedTally: vi.fn(),
      createElection: vi.fn(),
      registerVoters: vi.fn(),
      openVoting: vi.fn(),
      castBallot: vi.fn(),
      closeVoting: vi.fn(),
      submitDecryptionProof: vi.fn(),
      isVoterRegistered: vi.fn().mockResolvedValue(true),
      isRegisteredVoter: vi.fn().mockResolvedValue(true),
      hasNullifierBeenUsed: vi.fn(),
    };

    const mockAuth: AuthContextType = {
      isAuthenticated: true,
      identity: null,
      principal: Principal.fromText('2vxsx-fae'),
      principalText: '2vxsx-fae',
      sessionExpired: false,
      login: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
      sessionToken: null,
    };

    const { unmount } = render(<VoterView canister={mockCanister} auth={mockAuth} />);
    const secretInput = screen.getByLabelText(/Voter Secret Passphrase/i) as HTMLInputElement;
    fireEvent.change(secretInput, { target: { value: 'my_top_secret_passphrase' } });
    expect(secretInput.value).toBe('my_top_secret_passphrase');

    // Trigger browser pagehide event
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(secretInput.value).toBe('');

    unmount();
  });

  it('clears trustee shares input on pagehide', () => {
    const mockCanister: UseCanisterReturn = {
      electionDetails: {
        title: 'Test Election',
        admin: Principal.fromText('2vxsx-fae'),
        trustee_pk_hex:
          '0x076a08ecc41a54b38d6174a742c07d3b070fb1f2cfaea56ffcf99859f3d9d3000dfb3506cbe8a48efaaae431b9e28e6c703b41706692da3beaa2d861d85efec0',
        phase: { Tallying: null },
        start_time: 0n,
        end_time: 0n,
        registered_voters_count: 5n,
        total_ballots_cast: 2n,
        final_tally: [],
        proof_verified: false,
      },
      encryptedTally: { c1_hex: '0x01', c2_hex: '0x02', total_ballots: 2n },
      loading: false,
      isSlowNetwork: false,
      error: null,
      refreshState: vi.fn(),
      getElectionDetails: vi.fn(),
      getEncryptedTally: vi.fn(),
      createElection: vi.fn(),
      registerVoters: vi.fn(),
      openVoting: vi.fn(),
      castBallot: vi.fn(),
      closeVoting: vi.fn(),
      submitDecryptionProof: vi.fn(),
      isVoterRegistered: vi.fn(),
      isRegisteredVoter: vi.fn(),
      hasNullifierBeenUsed: vi.fn(),
    };

    render(<TrusteeView canister={mockCanister} />);
    const textarea = screen.getByLabelText(/Input Threshold Shares/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '1:0xabcd\n2:0xef01' } });
    expect(textarea.value).toBe('1:0xabcd\n2:0xef01');

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(textarea.value).toBe('');
  });
});

describe('WASM Binding Signature Integrity Verification', () => {
  it('verifies generated voting_crypto_wasm.d.ts exports match Rust #[wasm_bindgen] functions and TypeScript wrapper', () => {
    const dtsPath = path.resolve(__dirname, '../src/crypto/pkg/voting_crypto_wasm.d.ts');
    const rustPath = path.resolve(__dirname, '../../crates/voting_crypto_wasm/src/lib.rs');
    const wrapperPath = path.resolve(__dirname, '../src/crypto/index.ts');

    const dtsContent = fs.readFileSync(dtsPath, 'utf-8');
    const rustContent = fs.readFileSync(rustPath, 'utf-8');
    const wrapperContent = fs.readFileSync(wrapperPath, 'utf-8');

    const expectedSignatures = [
      'export function combine_threshold_shares_wasm(shares_js: any): string;',
      'export function decrypt_and_prove_tally_wasm(sk_hex: string, c1_sum_hex: string, c2_sum_hex: string, max_bound: bigint): any;',
      'export function generate_threshold_trustee_keys(threshold: bigint, total_shares: bigint): any;',
      'export function generate_voter_ballot(master_pk_hex: string, voter_secret_hex: string, election_id: string, vote: number): any;',
      'export function verify_ballot_range_proof(master_pk_hex: string, c1_hex: string, c2_hex: string, range_proof_js: any): boolean;',
    ];

    for (const sig of expectedSignatures) {
      expect(dtsContent).toContain(sig);
    }

    const fnNames = [
      'combine_threshold_shares_wasm',
      'decrypt_and_prove_tally_wasm',
      'generate_threshold_trustee_keys',
      'generate_voter_ballot',
      'verify_ballot_range_proof',
    ];

    for (const fnName of fnNames) {
      expect(rustContent).toContain(`pub fn ${fnName}`);
      expect(wrapperContent).toContain(fnName);
    }
  });
});

describe('Design System WCAG AA Contrast Verification', () => {
  it('verifies all light and dark theme text/surface and UI pairs meet WCAG AA thresholds', () => {
    // Light theme checks (>= 4.5:1 for text, >= 3.0:1 for borders/UI)
    expect(getContrastRatio(DESIGN_TOKENS.light.textPrimary, DESIGN_TOKENS.light.bgMain)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(DESIGN_TOKENS.light.textPrimary, DESIGN_TOKENS.light.bgCard)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(DESIGN_TOKENS.light.textSecondary, DESIGN_TOKENS.light.bgMain)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(DESIGN_TOKENS.light.textSecondary, DESIGN_TOKENS.light.bgCard)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(DESIGN_TOKENS.light.textMuted, DESIGN_TOKENS.light.bgMain)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(DESIGN_TOKENS.light.textMuted, DESIGN_TOKENS.light.bgCard)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio('#FFFFFF', DESIGN_TOKENS.light.cobaltPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(DESIGN_TOKENS.light.borderColor, DESIGN_TOKENS.light.bgMain)).toBeGreaterThanOrEqual(3.0);

    // Dark theme checks (>= 4.5:1 for text, >= 3.0:1 for borders/UI)
    expect(getContrastRatio(DESIGN_TOKENS.dark.textPrimary, DESIGN_TOKENS.dark.bgMain)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(DESIGN_TOKENS.dark.textPrimary, DESIGN_TOKENS.dark.bgCard)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(DESIGN_TOKENS.dark.textSecondary, DESIGN_TOKENS.dark.bgMain)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(DESIGN_TOKENS.dark.textSecondary, DESIGN_TOKENS.dark.bgCard)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(DESIGN_TOKENS.dark.textMuted, DESIGN_TOKENS.dark.bgMain)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(DESIGN_TOKENS.dark.textMuted, DESIGN_TOKENS.dark.bgCard)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio('#FFFFFF', DESIGN_TOKENS.dark.cobaltPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(DESIGN_TOKENS.dark.borderColor, DESIGN_TOKENS.dark.bgMain)).toBeGreaterThanOrEqual(3.0);
  });
});
