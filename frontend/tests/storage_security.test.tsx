import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TrusteeView } from '../src/views/TrusteeView';
import type { UseCanisterReturn } from '../src/hooks/useCanister';
import { Principal } from '../src/types/principal';

// Mock external crypto & canister calls only
vi.mock('../src/crypto', () => ({
  generateThresholdKeys: vi.fn(),
  combineKeyShares: vi.fn().mockResolvedValue('0xreconstructed_secret_key_12345'),
  decryptAndProveTally: vi.fn().mockResolvedValue({
    decrypted_tally: 42,
    hex_proof: {
      a_hex: '0x01',
      b_hex: '0x02',
      s_hex: '0x03',
      w_hex: '0x04',
      decrypted_tally: 42,
    },
  }),
}));

describe('TrusteeView Real Component Storage Security Invariant', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('renders real TrusteeView, processes key shares through UI events, and verifies zero localStorage/sessionStorage writes', async () => {
    // Initial condition: storage is strictly empty
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    const mockSubmitDecryptionProof = vi.fn().mockResolvedValue(BigInt(42));

    const mockCanister: UseCanisterReturn = {
      electionDetails: {
        title: 'Municipal Election 2026',
        admin: Principal.fromText('2vxsx-fae'),
        trustee_pk_hex: '0x076a08ecc41a54b38d6174a742c07d3b070fb1f2cfaea56ffcf99859f3d9d3000dfb3506cbe8a48efaaae431b9e28e6c703b41706692da3beaa2d861d85efec0',
        phase: { Tallying: null }, // Enable tallying phase so submit button is active
        start_time: BigInt(0),
        end_time: BigInt(0),
        registered_voters_count: BigInt(100),
        total_ballots_cast: BigInt(42),
        final_tally: [],
        proof_verified: false,
      },
      encryptedTally: {
        c1_hex: '0x22be268019741f2fafe7cb402b489d701026dfa7ce9e585fdfdb4efea1211e40',
        c2_hex: '0x1cf9e3346e9dfd6e469c84e1b6f007914f6bdf1a070eb358178d8a572a1e05fe',
        total_ballots: BigInt(42),
      },
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
      submitDecryptionProof: mockSubmitDecryptionProof,
      isVoterRegistered: vi.fn(),
      isRegisteredVoter: vi.fn(),
      hasNullifierBeenUsed: vi.fn(),
    };

    // 1. Render the real TrusteeView component
    render(<TrusteeView canister={mockCanister} />);

    // 2. Find the real share input textarea
    const textarea = screen.getByPlaceholderText(/1:0x1234/);
    expect(textarea).not.toBeNull();

    // 3. User inputs 3 trustee shares through real DOM event
    const inputShares = "1:0x1234abcd5678\n2:0xabcdef123456\n3:0x9876543210fe";
    fireEvent.change(textarea, { target: { value: inputShares } });

    // 4. Click the submit button
    const submitBtn = screen.getByRole('button', { name: /Reconstruct, Prove & Finalize Tally/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
    fireEvent.click(submitBtn);

    // 5. Await completion and verification message
    await waitFor(() => {
      expect(screen.getByText(/Success! Election tally verified and finalized/i)).not.toBeNull();
    });

    // 6. Verify real browser storage: zero sensitive keys, zero leakage
    expect(window.localStorage.getItem('trustee_shares')).toBeNull();
    expect(window.localStorage.getItem('secret_key')).toBeNull();
    expect(window.localStorage.getItem('sharesInputText')).toBeNull();
    expect(window.sessionStorage.getItem('trustee_shares')).toBeNull();
    expect(window.sessionStorage.getItem('secret_key')).toBeNull();

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
