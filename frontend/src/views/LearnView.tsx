import React from 'react';
import type { UseCanisterReturn } from '../hooks/useCanister';
import {
  GLOSSARY,
  REGULATORY_CITATIONS,
  SECURITY_LIMITATIONS,
  SECURITY_PROTECTIONS,
  type GlossaryKey,
  type RoutePath,
  type WalkthroughRole,
} from '../content/copy';
import { GlossaryTerm, OrientationBanner } from '../components/OrientationBanner';

interface LearnViewProps {
  canister: UseCanisterReturn;
  onNavigate: (path: RoutePath) => void;
  onOpenWalkthrough: (role: WalkthroughRole) => void;
}

export const LearnView: React.FC<LearnViewProps> = ({
  canister,
  onNavigate,
  onOpenWalkthrough,
}) => {
  return (
    <div>
      <OrientationBanner
        electionDetails={canister.electionDetails}
        walkthroughRole="voter"
        onOpenWalkthrough={onOpenWalkthrough}
        onNavigate={onNavigate}
        orientation={{
          whereAmI: 'Learn (/learn) — Plain-language guide, security model, regulatory considerations, privacy notice, and shared glossary.',
          whatCanIDoNow:
            'Read how ballots are protected, review the standing technical limitations, inspect regulatory frameworks for organizers, or launch a guided walkthrough.',
          whatHappensNext:
            'When you are ready, navigate to Vote (/vote) to cast a ballot or Verify results (/verify) to audit the election.',
          whatIfSomethingGoesWrong:
            'To report a security issue, use the GitHub Private Vulnerability Reporting link below. For keyboard or network help, visit /help.',
        }}
      />

      {/* Section 1: Re-open Role Walkthroughs & Plain-Language Overview */}
      <div className="card mb-6">
        <div className="flex justify-between items-center mb-4" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <span className="badge badge-cobalt">Interactive Role Guides</span>
          <span className="text-muted" style={{ fontSize: '0.82rem' }}>
            Re-open any walkthrough at any time
          </span>
        </div>
        <h2>How This Voting System Works</h2>
        <p className="text-secondary mt-2 mb-4" style={{ lineHeight: 1.6 }}>
          Traditional online polls require voters to trust the server operator not to read or alter their votes. This
          system separates <strong>voter eligibility</strong>, <strong>ballot encryption</strong>, and{' '}
          <strong>tally decryption</strong> so that no single person can see how you voted. Your browser locks your YES
          (1) or NO (0) vote inside a{' '}
          <GlossaryTerm term="ciphertext" onNavigate={onNavigate}>
            ciphertext
          </GlossaryTerm>
          , attaches a{' '}
          <GlossaryTerm term="proof" onNavigate={onNavigate}>
            zero-knowledge proof
          </GlossaryTerm>{' '}
          that your ballot is a valid 0 or 1, and computes a one-way{' '}
          <GlossaryTerm term="nullifier" onNavigate={onNavigate}>
            nullifier
          </GlossaryTerm>{' '}
          fingerprint so no one can vote twice. Only after voting closes can a{' '}
          <GlossaryTerm term="threshold" onNavigate={onNavigate}>
            threshold (n of m)
          </GlossaryTerm>{' '}
          group of{' '}
          <GlossaryTerm term="trustee" onNavigate={onNavigate}>
            trustees
          </GlossaryTerm>{' '}
          unlock the combined total.
        </p>

        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn-primary" onClick={() => onOpenWalkthrough('voter')}>
            Open Voter Walkthrough (6 Steps)
          </button>
          <button type="button" className="btn-secondary" onClick={() => onOpenWalkthrough('observer')}>
            Open Observer Walkthrough
          </button>
          <button type="button" className="btn-secondary" onClick={() => onOpenWalkthrough('admin')}>
            Open Admin Walkthrough
          </button>
          <button type="button" className="btn-secondary" onClick={() => onOpenWalkthrough('trustee')}>
            Open Trustee Walkthrough
          </button>
        </div>
      </div>

      {/* Section 2: Security Model — Equal-Prominence Protections and Limitations */}
      <div className="grid grid-cols-2 mb-6" id="security-section">
        <div className="card">
          <span className="badge badge-cobalt mb-2">Cryptographic Protections</span>
          <h2 className="mb-4">What This System Protects</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {SECURITY_PROTECTIONS.map((item, idx) => (
              <div
                key={idx}
                style={{
                  paddingBottom: '0.85rem',
                  borderBottom: idx < SECURITY_PROTECTIONS.length - 1 ? '1px solid var(--border-color)' : 'none',
                }}
              >
                <h3 style={{ fontSize: '0.96rem', marginBottom: '0.25rem' }}>{item.title}</h3>
                <p className="text-secondary" style={{ fontSize: '0.86rem', lineHeight: 1.55 }}>
                  {item.summary}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid var(--text-primary)' }}>
          <span className="badge badge-neutral mb-2">Standing Architectural Boundaries</span>
          <h2 className="mb-4">What This System Does NOT Protect Against</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {SECURITY_LIMITATIONS.map((item, idx) => (
              <div
                key={idx}
                style={{
                  paddingBottom: '0.85rem',
                  borderBottom: idx < SECURITY_LIMITATIONS.length - 1 ? '1px solid var(--border-color)' : 'none',
                }}
              >
                <h3 style={{ fontSize: '0.96rem', marginBottom: '0.25rem' }}>{item.title}</h3>
                <p className="text-secondary" style={{ fontSize: '0.86rem', lineHeight: 1.55 }}>
                  {item.summary}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 3: Regulatory Considerations — Honest, Sourced */}
      <div className="card mb-6" id="regulations-section">
        <div className="flex justify-between items-center mb-2" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <span className="badge badge-neutral">Informational Reference Only — Not Legal Advice</span>
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>
            Primary sources verified: 2026-10-31
          </span>
        </div>
        <h2>Considerations for Election Organizers (Not Legal Advice)</h2>
        <div className="status-banner mt-4 mb-4" role="note">
          <span className="status-prefix">[LEGAL &amp; CERTIFICATION DISCLAIMER]:</span> This section provides general
          technical and regulatory background for election organizers and is <strong>not legal advice</strong>. This
          software has <strong>not</strong> been evaluated, certified, or approved against any national, state, or
          statutory election law or voting-equipment certification standard. Organizers must consult qualified legal
          counsel before using any electronic voting tool in a regulated setting.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          {REGULATORY_CITATIONS.map((cit, idx) => (
            <div
              key={idx}
              style={{
                padding: '1rem',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
              }}
            >
              <div className="flex justify-between items-center mb-2" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>{cit.framework}</h3>
                <span className="badge badge-neutral">Accessed: {cit.accessedDate}</span>
              </div>
              <p style={{ fontSize: '0.84rem', marginBottom: '0.35rem' }}>
                <strong>Document:</strong> {cit.officialTitle} — <em>{cit.authorityAndYear}</em>
              </p>
              <p className="text-secondary mb-2" style={{ fontSize: '0.86rem', lineHeight: 1.55 }}>
                {cit.relevanceToThisSystem}
              </p>
              <p style={{ fontSize: '0.82rem', margin: 0 }}>
                <strong>Primary Source URL:</strong>{' '}
                <a
                  href={cit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--cobalt-accent-text)', wordBreak: 'break-all' }}
                >
                  {cit.url}
                </a>
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Section 4: Privacy Notice & On-Chain Data Retention */}
      <div className="card mb-6" id="privacy-notice">
        <span className="badge badge-cobalt mb-2">Privacy &amp; Data Handling Notice</span>
        <h2 className="mb-4">Privacy Notice: What Is Stored Locally vs. On-Chain</h2>
        <div className="grid grid-cols-2" style={{ gap: '1rem', fontSize: '0.88rem' }}>
          <div
            style={{
              padding: '1rem',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
            }}
          >
            <h3 style={{ fontSize: '0.96rem', marginBottom: '0.4rem' }}>1. Browser Local Storage &amp; IndexedDB</h3>
            <p className="text-secondary" style={{ lineHeight: 1.55 }}>
              This application writes <strong>zero keys</strong> to <code>window.localStorage</code> or{' '}
              <code>window.sessionStorage</code> (enforced by automated component tests). When you sign in with Internet
              Identity, the official <code>@dfinity/auth-client</code> library stores only your delegated session keypair
              in browser IndexedDB (<code>auth-client-db</code> &rarr; <code>ic-keyval</code>: keys{' '}
              <code>identity</code>, <code>delegation</code>, <code>iv</code>) with an 8-hour maximum time-to-live. Voter
              secret passphrases and trustee key shares exist strictly in volatile React memory and are cleared on
              <code>pagehide</code> and component unmount.
            </p>
          </div>

          <div
            style={{
              padding: '1rem',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
            }}
          >
            <h3 style={{ fontSize: '0.96rem', marginBottom: '0.4rem' }}>2. On-Chain Canister State &amp; Retention</h3>
            <p className="text-secondary" style={{ lineHeight: 1.55 }}>
              The ICP canister stores: the election title, the administrator Principal ID, the Trustee Master Public Key
              hex, the set of registered voter Principal IDs (<code>registered_voters</code>), the set of 32-byte used
              nullifier hashes (<code>used_nullifiers</code>), the homomorphic ciphertext sum (<code>C1</code>,{' '}
              <code>C2</code>), and the final verified tally. On-chain records persist in canister stable memory across
              upgrades until the administrator re-initializes the election or deletes the canister.
            </p>
          </div>
        </div>
        <p className="text-secondary mt-4" style={{ fontSize: '0.86rem' }}>
          <strong>Zero Analytics or Third-Party Trackers:</strong> This frontend loads zero external fonts, zero
          analytics scripts, and zero third-party telemetry. Every network request goes exclusively to the application
          origin, the configured Internet Computer replica, or Internet Identity during sign-in.
        </p>
      </div>

      {/* Section 5: Report a Vulnerability */}
      <div className="card mb-6" id="report-vulnerability">
        <span className="badge badge-neutral mb-2">Responsible Security Disclosure</span>
        <h2 className="mb-2">Report a Vulnerability</h2>
        <p className="text-secondary mb-4" style={{ fontSize: '0.9rem', lineHeight: 1.55 }}>
          If you discover a security or cryptographic vulnerability in this project, please do not open a public issue.
          Submit a private report through GitHub Private Vulnerability Reporting, as documented in{' '}
          <code>SECURITY.md</code> in the repository root:
        </p>
        <p style={{ fontSize: '0.88rem', marginBottom: '0.5rem' }}>
          <strong>GitHub Security Advisory URL:</strong>{' '}
          <a
            href="https://github.com/Blockchain-based-secure-voting-system/Blockchain-based-secure-voting-system/security/advisories/new"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--cobalt-accent-text)', fontWeight: 600, wordBreak: 'break-all' }}
          >
            https://github.com/Blockchain-based-secure-voting-system/Blockchain-based-secure-voting-system/security/advisories/new
          </a>
        </p>
        <p className="text-muted" style={{ fontSize: '0.82rem' }}>
          Note for repository administrators: Ensure <em>Private vulnerability reporting</em> is enabled under GitHub
          Repository Settings &rarr; Code security and analysis.
        </p>
      </div>

      {/* Section 6: Shared Glossary */}
      <div className="card" id="glossary-section">
        <span className="badge badge-cobalt mb-2">Shared Vocabulary</span>
        <h2 className="mb-4">Glossary of Key Terms</h2>
        <dl style={{ display: 'flex', flexDirection: 'column', gap: '1rem', margin: 0 }}>
          {(Object.keys(GLOSSARY) as GlossaryKey[]).map((key) => {
            const entry = GLOSSARY[key];
            return (
              <div
                key={key}
                id={`glossary-${key}`}
                style={{
                  padding: '0.95rem',
                  backgroundColor: 'var(--bg-subtle)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                }}
              >
                <dt style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                  {entry.label} (<code>{entry.term}</code>)
                </dt>
                <dd style={{ margin: '0.35rem 0 0 0' }}>
                  <p className="text-secondary" style={{ fontSize: '0.88rem', marginBottom: '0.35rem' }}>
                    {entry.plainDefinition}
                  </p>
                  <details>
                    <summary style={{ cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                      Technical definition
                    </summary>
                    <p className="text-muted mt-2" style={{ fontSize: '0.82rem' }}>
                      {entry.technicalNote}
                    </p>
                  </details>
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </div>
  );
};
