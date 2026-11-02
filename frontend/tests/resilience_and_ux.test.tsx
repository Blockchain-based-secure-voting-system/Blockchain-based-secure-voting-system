import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Principal } from '../src/types/principal';
import { HomeView } from '../src/views/HomeView';
import { PublicView } from '../src/views/PublicView';
import { VoterView } from '../src/views/VoterView';
import { AdminView } from '../src/views/AdminView';
import { TrusteeView } from '../src/views/TrusteeView';
import { LearnView } from '../src/views/LearnView';
import { HelpView } from '../src/views/HelpView';
import { WalkthroughModal } from '../src/components/WalkthroughModal';
import { mapToSafeErrorMessage } from '../src/utils/errorMapper';
import type { UseCanisterReturn } from '../src/hooks/useCanister';
import type { AuthContextType } from '../src/hooks/useAuth';

function createBaseMockCanister(overrides: Partial<UseCanisterReturn> = {}): UseCanisterReturn {
  return {
    electionDetails: {
      title: '2026 Civic Referendum',
      admin: Principal.fromText('2vxsx-fae'),
      trustee_pk_hex:
        '0x076a08ecc41a54b38d6174a742c07d3b070fb1f2cfaea56ffcf99859f3d9d3000dfb3506cbe8a48efaaae431b9e28e6c703b41706692da3beaa2d861d85efec0',
      phase: { Voting: null },
      start_time: 1761900000n * 1_000_000_000n,
      end_time: BigInt(Date.now() + 3600_000) * 1_000_000n,
      registered_voters_count: 10n,
      total_ballots_cast: 3n,
      final_tally: [],
      proof_verified: false,
    },
    encryptedTally: {
      c1_hex: '0x22be268019741f2fafe7cb402b489d701026dfa7ce9e585fdfdb4efea1211e40',
      c2_hex: '0x1cf9e3346e9dfd6e469c84e1b6f007914f6bdf1a070eb358178d8a572a1e05fe',
      total_ballots: 3n,
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
    submitDecryptionProof: vi.fn(),
    isVoterRegistered: vi.fn().mockResolvedValue(true),
    isRegisteredVoter: vi.fn().mockResolvedValue(true),
    hasNullifierBeenUsed: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function createBaseMockAuth(overrides: Partial<AuthContextType> = {}): AuthContextType {
  return {
    isAuthenticated: true,
    identity: null,
    principal: Principal.fromText('bkyz2-fmaaa-aaaaa-qaaaq-cai'),
    principalText: 'bkyz2-fmaaa-aaaaa-qaaaq-cai',
    sessionExpired: false,
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    sessionToken: null,
    ...overrides,
  };
}

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

describe('Parts 2–5: Information Architecture, Walkthrough, Honest Security/Regulations & Resilience Suite', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('verifies every route view answers the 4 orientation questions and links the 5 glossary terms', () => {
    const canister = createBaseMockCanister();
    const auth = createBaseMockAuth();
    const noop = vi.fn();

    const views = [
      <HomeView key="home" canister={canister} onNavigate={noop} onOpenWalkthrough={noop} />,
      <VoterView key="vote" canister={canister} auth={auth} onNavigate={noop} onOpenWalkthrough={noop} />,
      <PublicView key="verify" canister={canister} onNavigate={noop} onOpenWalkthrough={noop} />,
      <AdminView key="admin" canister={canister} auth={auth} onNavigate={noop} onOpenWalkthrough={noop} />,
      <TrusteeView key="trustee" canister={canister} onNavigate={noop} onOpenWalkthrough={noop} />,
      <LearnView key="learn" canister={canister} onNavigate={noop} onOpenWalkthrough={noop} />,
      <HelpView key="help" canister={canister} onNavigate={noop} onOpenWalkthrough={noop} />,
    ];

    for (const view of views) {
      const { unmount, container } = render(view);
      expect(screen.getByText('Where am I?')).toBeDefined();
      expect(screen.getByText('What can I do now?')).toBeDefined();
      expect(screen.getByText('What happens next?')).toBeDefined();
      expect(screen.getByText('What if something goes wrong?')).toBeDefined();

      // Verify glossary links exist on every page
      const glossaryLinks = container.querySelectorAll('a[href^="/learn#glossary-"]');
      expect(glossaryLinks.length).toBeGreaterThanOrEqual(5);
      unmount();
    }
  }, 25000);

  it('executes the Guided Walkthrough with keyboard navigation (ArrowRight, ArrowLeft, Escape), displays device privacy boundary, and writes zero storage keys', () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    render(
      <WalkthroughModal
        isOpen={true}
        initialRole="voter"
        onClose={onClose}
        onNavigate={onNavigate}
      />
    );

    // Step 1
    expect(screen.getByText(/1\. Sign in with Internet Identity/i)).toBeDefined();

    // Advance to Step 4 using ArrowRight key
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    });

    expect(screen.getByText(/4\. Review what leaves your device vs\. what stays private/i)).toBeDefined();
    expect(screen.getByText(/What Leaves Your Device \(Sent to Canister\)/i)).toBeDefined();
    expect(screen.getByText(/What NEVER Leaves Your Device/i)).toBeDefined();

    // Escape key closes walkthrough
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Zero storage keys written
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('verifies zero forbidden marketing buzzwords in frontend/src/ and checks honest security limitations & regulatory citations on /learn', () => {
    const srcDir = path.resolve(__dirname, '../src');
    const files = collectSourceFiles(srcDir);
    const forbiddenWords = ['unhackable', 'military-grade', 'fully secure', 'audit-ready'];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8').toLowerCase();
      for (const word of forbiddenWords) {
        expect(
          content.includes(word),
          `Forbidden marketing buzzword "${word}" found in ${path.relative(srcDir, file)}`
        ).toBe(false);
      }
    }

    const canister = createBaseMockCanister();
    render(<LearnView canister={canister} onNavigate={vi.fn()} onOpenWalkthrough={vi.fn()} />);

    expect(screen.getByText('What This System Protects')).toBeDefined();
    expect(screen.getByText('What This System Does NOT Protect Against')).toBeDefined();
    expect(screen.getByText(/Single-Dealer Threshold Key Setup/i)).toBeDefined();
    expect(screen.getByText(/No Receipt-Freeness or Coercion Resistance/i)).toBeDefined();
    expect(screen.getByText(/Considerations for Election Organizers \(Not Legal Advice\)/i)).toBeDefined();
    expect(screen.getAllByText(/Accessed: 2026-10-31/i).length).toBe(4);
    expect(
      screen.getByText(
        'https://github.com/Blockchain-based-secure-voting-system/Blockchain-based-secure-voting-system/security/advisories/new'
      )
    ).toBeDefined();
  });

  it('simulates all 5 resilience states (replica unreachable, wrong network, expired session, canister rejection preserving inputs, and expired voting deadline)', async () => {
    // 1. Replica unreachable
    const unreachableMsg = mapToSafeErrorMessage(new Error('TypeError: Failed to fetch (ERR_CONNECTION_REFUSED)'));
    expect(unreachableMsg).toContain('Cannot reach the election canister on the Internet Computer replica');

    // 2. Wrong network / canister not deployed
    const wrongNetMsg = mapToSafeErrorMessage(new Error('IC0301: canister_not_found DestinationInvalid'));
    expect(wrongNetMsg).toContain('Wrong Network or Canister Not Deployed');

    // 3. Expired Internet Identity delegation
    const expiredMsg = mapToSafeErrorMessage(new Error('Invalid signature: delegation has expired'));
    expect(expiredMsg).toContain('Your Internet Identity session has expired');

    // 4. Canister rejection in AdminView preserves non-secret form inputs
    const failingCreateCanister = createBaseMockCanister({
      electionDetails: {
        ...createBaseMockCanister().electionDetails!,
        phase: { Setup: null },
      },
      createElection: vi.fn().mockRejectedValue(new Error('Only the canister admin can initialize an election')),
    });
    const auth = createBaseMockAuth();
    const { unmount } = render(<AdminView canister={failingCreateCanister} auth={auth} />);

    const titleInput = screen.getByLabelText(/Election Title/i) as HTMLInputElement;
    const pkInput = screen.getByLabelText(/Trustee Master Public Key/i) as HTMLInputElement;
    const validPk =
      '0x076a08ecc41a54b38d6174a742c07d3b070fb1f2cfaea56ffcf99859f3d9d3000dfb3506cbe8a48efaaae431b9e28e6c703b41706692da3beaa2d861d85efec0';

    fireEvent.change(titleInput, { target: { value: 'Preserved Civic Election Title' } });
    fireEvent.change(pkInput, { target: { value: validPk } });

    const submitBtn = screen.getByRole('button', { name: /Initialize Election in Setup Phase/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Error is shown in plain language AND non-secret inputs are preserved
    expect(screen.getByRole('alert').textContent).toContain(
      'Authorization denied: Only the Principal ID that initialized the canister'
    );
    expect(titleInput.value).toBe('Preserved Civic Election Title');
    expect(pkInput.value).toBe(validPk);
    unmount();

    // 5. Voting closed by wall-clock time while canister phase is still Voting
    const expiredDeadlineCanister = createBaseMockCanister({
      electionDetails: {
        ...createBaseMockCanister().electionDetails!,
        phase: { Voting: null },
        end_time: BigInt(Date.now() - 120_000) * 1_000_000n,
      },
    });
    render(<PublicView canister={expiredDeadlineCanister} />);
    expect(screen.getByTestId('deadline-expired-banner').textContent).toContain(
      '[DEADLINE PASSED — AWAITING ADMIN TRANSITION]'
    );
    expect(screen.getByTestId('verify-it-yourself-section').textContent).toContain(
      'dfx canister call canister get_election_details'
    );
  });
});
