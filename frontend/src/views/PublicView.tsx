import React from 'react';
import { PhaseBadge } from '../components/PhaseBadge';
import type { UseCanisterReturn } from '../hooks/useCanister';
import { CheckCircle, ShieldAlert, BarChart3, RefreshCw, Layers, AlertTriangle } from 'lucide-react';

export const PublicView: React.FC<{ canister: UseCanisterReturn }> = ({ canister }) => {
  const { electionDetails, encryptedTally, loading, error, refreshState } = canister;

  const isComplete = electionDetails?.phase && 'Complete' in electionDetails.phase;
  const tallyValue =
    electionDetails?.final_tally && electionDetails.final_tally.length > 0 && electionDetails.final_tally[0] !== undefined
      ? electionDetails.final_tally[0].toString()
      : null;

  return (
    <div className="stack-lg">
      <section className="card" aria-labelledby="public-heading">
        <div className="row-between">
          <div className="stack-sm">
            <div className="row-wrap">
              <h2 id="public-heading" className="card-title">
                {electionDetails?.title || 'Decentralized Election'}
              </h2>
              <PhaseBadge phase={electionDetails?.phase} />
            </div>
            <p className="text-secondary">
              Cryptographically verified read-only election state on the Internet Computer.
            </p>
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
              <strong>Loading State:</strong> Querying election status from canister...
            </span>
          </div>
        )}

        {error && !electionDetails && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <div className="row-between" style={{ width: '100%' }}>
              <span>
                <strong>Cannot Reach Canister:</strong> {error}
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
              <strong>Empty Election State:</strong> No election has been configured on the canister yet. An administrator must initialize the election in the Admin portal.
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
              <strong>Proof Verified:</strong> Chaum-Pedersen Discrete Log Equality proof verified by canister smart contract against Trustee Master Public Key.
            </span>
          </div>
        </section>
      )}

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
            <span className="receipt-key">Canister Admin Principal:</span>
            <span className="receipt-val">{electionDetails?.admin ? electionDetails.admin.toText() : 'N/A'}</span>
          </div>
        </div>
      </section>
    </div>
  );
};
