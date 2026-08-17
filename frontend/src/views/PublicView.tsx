import React from 'react';
import { PhaseBadge } from '../components/PhaseBadge';
import type { UseCanisterReturn } from '../hooks/useCanister';
import { CheckCircle, ShieldAlert, BarChart3, RefreshCw, Layers } from 'lucide-react';

export const PublicView: React.FC<{ canister: UseCanisterReturn }> = ({ canister }) => {
  const { electionDetails, encryptedTally, loading, refreshState } = canister;

  const isComplete = electionDetails?.phase && 'Complete' in electionDetails.phase;
  const tallyValue = electionDetails?.final_tally && electionDetails.final_tally.length > 0 && electionDetails.final_tally[0] !== undefined
    ? electionDetails.final_tally[0].toString()
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h2 className="card-title">{electionDetails?.title || 'Decentralized Election'}</h2>
              <PhaseBadge phase={electionDetails?.phase} />
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Cryptographically verified election state on the Internet Computer.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={refreshState} disabled={loading} style={{ padding: '0.5rem 0.75rem' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

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
            <span className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
              {electionDetails?.proof_verified ? (
                <>
                  <CheckCircle size={20} color="#10b981" />
                  <span style={{ color: '#10b981' }}>ZK Validated</span>
                </>
              ) : (
                <>
                  <ShieldAlert size={20} color="#94a3b8" />
                  <span style={{ color: '#94a3b8' }}>Awaiting Proof</span>
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {isComplete && tallyValue !== null && (
        <div className="card" style={{ border: '1px solid var(--success-border)', backgroundColor: 'rgba(16, 185, 129, 0.04)' }}>
          <div className="card-title" style={{ color: '#10b981' }}>
            <BarChart3 size={22} /> Final Election Result (Verified on-chain)
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#f8fafc' }}>
              {tallyValue}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
              YES votes out of {electionDetails?.total_ballots_cast?.toString()} total encrypted ballots cast
            </span>
          </div>
          <div className="alert alert-success" style={{ marginTop: '0.75rem' }}>
            <CheckCircle size={18} />
            <span>
              Chaum-Pedersen Discrete Log Equality proof verified by canister smart contract against Trustee Master Public Key.
            </span>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <Layers size={20} /> Homomorphically Aggregated Ciphertext
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
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
      </div>
    </div>
  );
};
