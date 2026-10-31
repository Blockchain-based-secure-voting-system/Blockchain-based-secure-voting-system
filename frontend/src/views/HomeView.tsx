import React from 'react';
import type { UseCanisterReturn } from '../hooks/useCanister';
import type { RoutePath, WalkthroughRole } from '../content/copy';
import { GlossaryTerm, OrientationBanner } from '../components/OrientationBanner';
import { PHASE_VOCABULARY, resolvePhaseKey } from '../content/errors';

interface HomeViewProps {
  canister: UseCanisterReturn;
  onNavigate: (path: RoutePath) => void;
  onOpenWalkthrough: (role: WalkthroughRole) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  canister,
  onNavigate,
  onOpenWalkthrough,
}) => {
  const { electionDetails } = canister;
  const phaseKey = resolvePhaseKey(electionDetails?.phase);
  const phaseInfo = phaseKey ? PHASE_VOCABULARY[phaseKey] : null;

  return (
    <div>
      <OrientationBanner
        electionDetails={electionDetails}
        walkthroughRole="voter"
        onOpenWalkthrough={onOpenWalkthrough}
        onNavigate={onNavigate}
        orientation={{
          whereAmI: 'Home (/) — Overview of the Civic Homomorphic Voting System and role entry points.',
          whatCanIDoNow:
            'Choose your role below (Voter, Public Observer, Election Administrator, or Trustee) or launch an interactive step-by-step walkthrough.',
          whatHappensNext: phaseInfo
            ? `${phaseInfo.badgeLabel}: ${phaseInfo.whatHappensNext}`
            : 'Once the election administrator initializes an election on the canister, live status appears here.',
          whatIfSomethingGoesWrong:
            'If the replica is unreachable or your session expires, use the Retry button in the status banner or visit Accessibility & Help (/help).',
        }}
      />

      <div className="card mb-6">
        <div className="flex justify-between items-center mb-4" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <span className="badge badge-cobalt">End-to-End Verifiable Civic Technology</span>
          <span className="text-muted" style={{ fontSize: '0.82rem' }}>
            Active Election: <strong>{electionDetails?.title || 'Uninitialized Election'}</strong>
          </span>
        </div>

        <h1 style={{ marginBottom: '0.75rem' }}>
          Private Ballots in Your Browser. Publicly Auditable Math on the Canister.
        </h1>
        <p className="text-secondary mb-4" style={{ fontSize: '1.02rem', lineHeight: 1.6 }}>
          This system is built for organizations, universities, and community boards that need a transparent YES/NO poll
          where no administrator can read individual votes and any observer can check the final count. When you vote,
          your browser locks your choice inside an encrypted{' '}
          <GlossaryTerm term="ciphertext" onNavigate={onNavigate}>
            ciphertext
          </GlossaryTerm>{' '}
          accompanied by a mathematical{' '}
          <GlossaryTerm term="proof" onNavigate={onNavigate}>
            zero-knowledge proof
          </GlossaryTerm>{' '}
          and a one-time{' '}
          <GlossaryTerm term="nullifier" onNavigate={onNavigate}>
            nullifier
          </GlossaryTerm>{' '}
          receipt. After voting closes, a{' '}
          <GlossaryTerm term="threshold" onNavigate={onNavigate}>
            threshold (n of m)
          </GlossaryTerm>{' '}
          group of independent{' '}
          <GlossaryTerm term="trustee" onNavigate={onNavigate}>
            trustees
          </GlossaryTerm>{' '}
          combines key shares in browser memory to unlock only the final sum.
        </p>

        <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn-primary" onClick={() => onNavigate('/vote')}>
            Go to Vote (/vote)
          </button>
          <button type="button" className="btn-secondary" onClick={() => onNavigate('/verify')}>
            Verify Results (/verify)
          </button>
          <button type="button" className="btn-secondary" onClick={() => onOpenWalkthrough('voter')}>
            Start Guided Walkthrough
          </button>
          <button type="button" className="btn-secondary" onClick={() => onNavigate('/learn')}>
            Read Security &amp; Regulations (/learn)
          </button>
        </div>
      </div>

      {/* Who This System Is For — Four Role Cards */}
      <h2 className="mb-4">Choose Your Role</h2>
      <div className="grid grid-cols-2 mb-6">
        <div className="card flex-col justify-between" style={{ display: 'flex' }}>
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="badge badge-cobalt">Role 1: Voter</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                Route: /vote
              </span>
            </div>
            <h3>Cast an Encrypted Ballot</h3>
            <p className="text-secondary mt-2 mb-4" style={{ fontSize: '0.9rem' }}>
              Sign in with Internet Identity, confirm your Principal ID is on the registered voter roll, and encrypt your
              YES (1) or NO (0) choice inside your browser. Receive a 32-byte nullifier receipt to check your ballot was
              counted.
            </p>
          </div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" onClick={() => onNavigate('/vote')}>
              Open Voter Portal
            </button>
            <button type="button" className="btn-secondary" onClick={() => onOpenWalkthrough('voter')}>
              Voter Walkthrough
            </button>
          </div>
        </div>

        <div className="card flex-col justify-between" style={{ display: 'flex' }}>
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="badge badge-neutral">Role 2: Public Observer</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                Route: /verify
              </span>
            </div>
            <h3>Verify Tally &amp; Audit Receipts</h3>
            <p className="text-secondary mt-2 mb-4" style={{ fontSize: '0.9rem' }}>
              Anyone can inspect the live ballot count, check whether a voter nullifier receipt was recorded on-chain,
              and run copyable <code>dfx canister call</code> commands to verify the tally without trusting this web UI.
            </p>
          </div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" onClick={() => onNavigate('/verify')}>
              Open Verification Portal
            </button>
            <button type="button" className="btn-secondary" onClick={() => onOpenWalkthrough('observer')}>
              Observer Walkthrough
            </button>
          </div>
        </div>

        <div className="card flex-col justify-between" style={{ display: 'flex' }}>
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="badge badge-neutral">Role 3: Election Administrator</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                Route: /admin
              </span>
            </div>
            <h3>Run an Election</h3>
            <p className="text-secondary mt-2 mb-4" style={{ fontSize: '0.9rem' }}>
              Initialize the election title and schedule, configure the Trustee Master Public Key, register eligible
              voter Principal IDs during Setup, and transition phases from Setup to Voting and Tallying.
            </p>
          </div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={() => onNavigate('/admin')}>
              Open Admin Portal
            </button>
            <button type="button" className="btn-secondary" onClick={() => onOpenWalkthrough('admin')}>
              Admin Walkthrough
            </button>
          </div>
        </div>

        <div className="card flex-col justify-between" style={{ display: 'flex' }}>
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="badge badge-neutral">Role 4: Key Trustee</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                Route: /trustee
              </span>
            </div>
            <h3>Threshold Key Custody &amp; Decryption</h3>
            <p className="text-secondary mt-2 mb-4" style={{ fontSize: '0.9rem' }}>
              Generate n-of-m Shamir secret shares before Setup, or combine at least n shares in volatile browser memory
              during Tallying to compute the YES count and submit an on-chain Chaum-Pedersen proof.
            </p>
          </div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={() => onNavigate('/trustee')}>
              Open Trustee Portal
            </button>
            <button type="button" className="btn-secondary" onClick={() => onOpenWalkthrough('trustee')}>
              Trustee Walkthrough
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Technical Summary */}
      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem' }}>
          Technical Architecture Summary (Expand for Cryptographic Primitives)
        </summary>
        <div className="mt-4 text-secondary" style={{ fontSize: '0.88rem', lineHeight: 1.6 }}>
          <p className="mb-2">
            <strong>Curve &amp; Group:</strong> Barreto-Naehrig BN254 (alt_bn128) G1 prime-order subgroup and scalar
            field Fr, compiled from Rust (<code>crates/voting_crypto</code>) to both the ICP canister
            (<code>wasm32-unknown-unknown</code>) and browser WebAssembly (<code>crates/voting_crypto_wasm</code>).
          </p>
          <p className="mb-2">
            <strong>Ballot Proof:</strong> 1-out-of-2 disjunctive Chaum-Pedersen sigma protocol proving{' '}
            <code>(C1, C2) = (r*G, m*G + r*PK)</code> for <code>m in {'{0, 1}'}</code> under Fiat-Shamir domain
            separation.
          </p>
          <p>
            <strong>Tally Proof:</strong> Homomorphic curve addition{' '}
            <code>(Sum C1, Sum C2) = ((Sum r_i)*G, (Sum m_i)*G + (Sum r_i)*PK)</code> followed by Baby-Step Giant-Step
            discrete-log recovery of <code>Sum m_i</code> and Chaum-Pedersen DLEQ verification on-chain.
          </p>
        </div>
      </details>
    </div>
  );
};
