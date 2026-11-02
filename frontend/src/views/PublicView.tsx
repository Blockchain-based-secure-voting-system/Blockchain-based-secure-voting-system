import React, { useState } from 'react';
import { PhaseBadge } from '../components/PhaseBadge';
import type { UseCanisterReturn } from '../hooks/useCanister';
import type { RoutePath, WalkthroughRole } from '../content/copy';
import { GlossaryTerm, OrientationBanner, DeadlineDisplay } from '../components/OrientationBanner';
import { validateHexString } from '../utils/validation';
import { CheckCircle, ShieldAlert, BarChart3, RefreshCw, Layers, AlertTriangle, Search, Terminal } from 'lucide-react';

interface PublicViewProps {
  canister: UseCanisterReturn;
  onNavigate?: (path: RoutePath) => void;
  onOpenWalkthrough?: (role: WalkthroughRole) => void;
}

export const PublicView: React.FC<PublicViewProps> = ({ canister, onNavigate, onOpenWalkthrough }) => {
  const { electionDetails, encryptedTally, loading, error, refreshState, hasNullifierBeenUsed } = canister;

  const [nullifierQueryHex, setNullifierQueryHex] = useState('');
  const [nullifierCheckResult, setNullifierCheckResult] = useState<{
    checkedHex: string;
    isUsed: boolean;
  } | null>(null);
  const [nullifierError, setNullifierError] = useState<string | null>(null);
  const [checkingNullifier, setCheckingNullifier] = useState(false);

  const isComplete = electionDetails?.phase && 'Complete' in electionDetails.phase;
  const tallyValue =
    electionDetails?.final_tally && electionDetails.final_tally.length > 0 && electionDetails.final_tally[0] !== undefined
      ? electionDetails.final_tally[0].toString()
      : null;

  const handleCheckNullifier = async (e: React.FormEvent) => {
    e.preventDefault();
    setNullifierError(null);
    setNullifierCheckResult(null);

    const check = validateHexString(nullifierQueryHex, 'Nullifier Receipt Hash', 32, 32);
    if (!check.valid) {
      setNullifierError(check.error || 'Nullifier must be a 64-character hexadecimal string (32 bytes).');
      return;
    }

    try {
      setCheckingNullifier(true);
      const rawHex = nullifierQueryHex.trim().replace(/^0x/i, '').toLowerCase();
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(rawHex.slice(i * 2, i * 2 + 2), 16);
      }
      const isUsed = await hasNullifierBeenUsed(bytes);
      setNullifierCheckResult({
        checkedHex: `0x${rawHex}`,
        isUsed,
      });
    } catch {
      setNullifierError('Could not query nullifier status from the server. Check backend connection and retry.');
    } finally {
      setCheckingNullifier(false);
    }
  };

  return (
    <div className="stack-lg">
      <OrientationBanner
        electionDetails={electionDetails}
        walkthroughRole="observer"
        onOpenWalkthrough={onOpenWalkthrough}
        onNavigate={onNavigate}
        orientation={{
          whereAmI: 'Verify Results (/verify) — Public observer dashboard, ballot receipt checker, and independent CLI audit guide.',
          whatCanIDoNow:
            'Inspect the live ballot count, check whether a 32-byte nullifier receipt was recorded on the bulletin board, or run the CLI audit commands below.',
          whatHappensNext: isComplete
            ? 'The election is Complete and the Chaum-Pedersen proof is cryptographically verified.'
            : 'While voting is open, ballots are homomorphically summed. Once Tallying completes, the verified YES count appears here.',
          whatIfSomethingGoesWrong:
            'If the server status is out of date, click Refresh below. If a nullifier lookup fails, verify it is 64 hex characters.',
        }}
      />

      <section className="card" aria-labelledby="public-heading">
        <div className="row-between">
          <div className="stack-sm">
            <div className="row-wrap">
              <h2 id="public-heading" className="card-title">
                {electionDetails?.title || 'Verifiable Election'}
              </h2>
              <PhaseBadge phase={electionDetails?.phase} />
            </div>
            <p className="text-secondary">
              Every accepted ballot{' '}
              <GlossaryTerm term="ciphertext" onNavigate={onNavigate}>
                ciphertext
              </GlossaryTerm>{' '}
              is verified with a{' '}
              <GlossaryTerm term="proof" onNavigate={onNavigate}>
                zero-knowledge proof
              </GlossaryTerm>{' '}
              and homomorphically accumulated on the bulletin board. Only a{' '}
              <GlossaryTerm term="threshold" onNavigate={onNavigate}>
                threshold
              </GlossaryTerm>{' '}
              of{' '}
              <GlossaryTerm term="trustee" onNavigate={onNavigate}>
                trustees
              </GlossaryTerm>{' '}
              can unlock the final tally after voting closes.
            </p>
            {electionDetails && (
              <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                <DeadlineDisplay label="Start Time" timestampNsOrSec={electionDetails.start_time} />
                {' · '}
                <DeadlineDisplay label="Closing Deadline" timestampNsOrSec={electionDetails.end_time} />
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={refreshState}
            disabled={loading}
          >
            <RefreshCw size={14} aria-hidden="true" /> {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading && !electionDetails && (
          <div className="alert alert-info" role="status" aria-live="polite">
            <RefreshCw size={18} aria-hidden="true" />
            <span>
              <strong>Loading State:</strong> Querying election status from server...
            </span>
          </div>
        )}

        {error && !electionDetails && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <div className="row-between" style={{ width: '100%' }}>
              <span>
                <strong>Cannot Reach Server:</strong> {error}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={refreshState}>
                Retry
              </button>
            </div>
          </div>
        )}

        {!loading && !error && (!electionDetails || !electionDetails.trustee_pk_hex) && (
          <div className="alert alert-info" role="status">
            <ShieldAlert size={18} aria-hidden="true" />
            <span>
              <strong>Empty Election State:</strong> No election has been configured on the server yet. An administrator must initialize the election in the Admin portal (/admin).
            </span>
          </div>
        )}

        <div className="grid-3">
          <div className="stat-box">
            <span className="stat-label">Registered Voters</span>
            <span className="stat-value">{electionDetails?.registered_voters_count?.toString() || '0'}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Encrypted Ballots Cast</span>
            <span className="stat-value">{electionDetails?.total_ballots_cast?.toString() || '0'}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">ZK Verification Status</span>
            <span className="stat-value row-wrap" style={{ fontSize: '1.1rem' }}>
              {electionDetails?.proof_verified ? (
                <>
                  <CheckCircle size={20} aria-hidden="true" />
                  <span>Verified: ZK Validated</span>
                </>
              ) : (
                <>
                  <ShieldAlert size={20} aria-hidden="true" />
                  <span>Pending: Awaiting Proof</span>
                </>
              )}
            </span>
          </div>
        </div>
      </section>

      {isComplete && tallyValue !== null && (
        <section className="card" aria-labelledby="final-result-heading">
          <h3 id="final-result-heading" className="card-title">
            <BarChart3 size={22} aria-hidden="true" /> Final Election Result (Verified On-Chain)
          </h3>
          <div className="row-wrap">
            <span className="stat-value" style={{ fontSize: '2.25rem' }}>
              {tallyValue}
            </span>
            <span className="text-secondary">
              YES votes out of {electionDetails?.total_ballots_cast?.toString()} total encrypted ballots cast
            </span>
          </div>
          <div className="alert alert-success" role="status" aria-live="polite">
            <CheckCircle size={18} aria-hidden="true" />
            <span>
              <strong>Proof Verified:</strong> Chaum-Pedersen Discrete Log Equality proof cryptographically verified against Trustee Master Public Key.
            </span>
          </div>
        </section>
      )}

      {/* Nullifier Receipt Verification Tool */}
      <section className="card" aria-labelledby="nullifier-check-heading">
        <h3 id="nullifier-check-heading" className="card-title">
          <Search size={20} aria-hidden="true" /> Verify Your Ballot Receipt (Nullifier Lookup)
        </h3>
        <p className="text-secondary">
          Paste the 64-character hexadecimal{' '}
          <GlossaryTerm term="nullifier" onNavigate={onNavigate}>
            nullifier
          </GlossaryTerm>{' '}
          receipt you received after casting your ballot to confirm that your ballot was recorded on the bulletin board.
        </p>

        <form onSubmit={handleCheckNullifier} className="stack-md" autoComplete="off">
          <div className="form-group">
            <label htmlFor="nullifier-lookup-input" className="form-label">
              32-Byte Ballot Nullifier Receipt (0x...)
            </label>
            <input
              id="nullifier-lookup-input"
              type="text"
              className="form-input text-mono"
              placeholder="0x..."
              value={nullifierQueryHex}
              onChange={(e) => setNullifierQueryHex(e.target.value)}
            />
          </div>
          <div>
            <button type="submit" className="btn btn-secondary" disabled={checkingNullifier}>
              {checkingNullifier ? 'Checking Server...' : 'Check Nullifier on Ledger'}
            </button>
          </div>
        </form>

        {nullifierError && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              <strong>Invalid Nullifier Format:</strong> {nullifierError}
            </span>
          </div>
        )}

        {nullifierCheckResult && (
          <div
            className={`alert ${nullifierCheckResult.isUsed ? 'alert-success' : 'alert-info'}`}
            role="status"
            aria-live="polite"
          >
            <CheckCircle size={18} aria-hidden="true" />
            <span>
              <strong>{nullifierCheckResult.isUsed ? '[RECORDED ON-CHAIN]:' : '[NOT FOUND]:'}</strong> Nullifier{' '}
              <code>{nullifierCheckResult.checkedHex}</code>{' '}
              {nullifierCheckResult.isUsed
                ? 'is present in the bulletin board’s used nullifiers set and included in the homomorphic sum.'
                : 'has not been submitted to this election server.'}
            </span>
          </div>
        )}
      </section>

      {/* Expandable Technical Cryptographic Summary */}
      <section className="card" aria-labelledby="ciphertext-summary-heading">
        <h3 id="ciphertext-summary-heading" className="card-title">
          <Layers size={20} aria-hidden="true" /> Homomorphically Aggregated Ciphertext Summary
        </h3>
        <p className="text-secondary">
          All encrypted ballots are homomorphically summed on-chain: <code>C_sum = C_1 + C_2 + ... + C_n</code>.
        </p>

        <div className="receipt-card">
          <div className="receipt-row">
            <span className="receipt-key">Trustee Master Public Key (PK):</span>
            <span className="receipt-val">{electionDetails?.trustee_pk_hex || 'Not Configured'}</span>
          </div>
          <div className="receipt-row">
            <span className="receipt-key">Homomorphic Sum C1:</span>
            <span className="receipt-val">{encryptedTally?.c1_hex || '0x00'}</span>
          </div>
          <div className="receipt-row">
            <span className="receipt-key">Homomorphic Sum C2:</span>
            <span className="receipt-val">{encryptedTally?.c2_hex || '0x00'}</span>
          </div>
          <div className="receipt-row">
            <span className="receipt-key">Admin Identity:</span>
            <span className="receipt-val">{electionDetails?.admin ? electionDetails.admin.toText() : 'N/A'}</span>
          </div>
        </div>
      </section>

      {/* "Verify It Yourself" CLI / REST API Section (Part 3.3) */}
      <section className="card" aria-labelledby="verify-yourself-heading" data-testid="verify-it-yourself-section">
        <h3 id="verify-yourself-heading" className="card-title">
          <Terminal size={20} aria-hidden="true" /> Verify It Yourself (Direct CLI &amp; REST API Queries)
        </h3>
        <p className="text-secondary">
          You do not need to trust this web interface. Any observer or auditor can verify the election independently
          using the audit CLI or direct REST queries against the immutable bulletin board:
        </p>

        <div className="receipt-card">
          <div className="stack-sm">
            <span className="receipt-key">1. Run Full Cryptographic Audit via CLI:</span>
            <pre className="receipt-val" style={{ whiteSpace: 'pre-wrap' }}>
              cargo run -p cli -- audit --api-url &quot;https://voting-system-api-wi7q.onrender.com&quot;
            </pre>
          </div>
          <div className="stack-sm">
            <span className="receipt-key">2. Fetch Election Details &amp; Public Parameters:</span>
            <pre className="receipt-val" style={{ whiteSpace: 'pre-wrap' }}>
              curl -s https://voting-system-api-wi7q.onrender.com/api/v1/election
            </pre>
          </div>
          <div className="stack-sm">
            <span className="receipt-key">3. Inspect the Append-Only Bulletin Board Chain:</span>
            <pre className="receipt-val" style={{ whiteSpace: 'pre-wrap' }}>
              curl -s https://voting-system-api-wi7q.onrender.com/api/v1/bulletin
            </pre>
          </div>
          <div className="stack-sm">
            <span className="receipt-key">4. Verify Homomorphic Tally &amp; Decryption Proof:</span>
            <pre className="receipt-val" style={{ whiteSpace: 'pre-wrap' }}>
              curl -s https://voting-system-api-wi7q.onrender.com/api/v1/tally
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
};
