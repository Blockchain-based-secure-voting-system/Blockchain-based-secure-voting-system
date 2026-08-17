import React, { useState, useEffect } from 'react';
import type { UseCanisterReturn } from '../hooks/useCanister';
import type { AuthContextType } from '../hooks/useAuth';
import { createClientSideBallot, verifyClientRangeProof } from '../crypto';
import { PhaseBadge } from '../components/PhaseBadge';
import { Vote, CheckCircle2, ShieldCheck, AlertTriangle, FileText, Lock } from 'lucide-react';

export const VoterView: React.FC<{ canister: UseCanisterReturn; auth: AuthContextType }> = ({ canister, auth }) => {
  const { electionDetails, castBallot } = canister;

  const [selectedVote, setSelectedVote] = useState<0 | 1 | null>(null);
  const [voterSecret, setVoterSecret] = useState('');
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    nullifierHex: string;
    c1Hex: string;
    c2Hex: string;
    rangeProofValid: boolean;
  } | null>(null);

  const phase = electionDetails?.phase;
  const isVotingOpen = phase && 'Voting' in phase;

  useEffect(() => {
    if (auth.principal && !auth.principal.isAnonymous()) {
      canister.isRegisteredVoter(auth.principal).then(setIsRegistered).catch(console.error);
    } else {
      setIsRegistered(null);
    }
  }, [auth.principal, canister]);

  const handleCastBallot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedVote === null) {
      setErrorMessage('Please select YES or NO.');
      return;
    }
    if (!voterSecret.trim()) {
      setErrorMessage('Please provide your voter secret phrase for double-vote nullifier derivation.');
      return;
    }
    if (!electionDetails?.trustee_pk_hex) {
      setErrorMessage('Trustee public key not configured on canister.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      // 1. Client-Side WASM Encryption & ZK Range Proof Generation
      // Plaintext vote value is consumed by WASM and NEVER returned to JS
      const wasmBallot = await createClientSideBallot(
        electionDetails.trustee_pk_hex,
        voterSecret.trim(),
        'icp_election_2026',
        selectedVote
      );

      // Verify range proof locally before transmission
      const isLocalProofValid = await verifyClientRangeProof(
        electionDetails.trustee_pk_hex,
        wasmBallot.ciphertext.c1_hex,
        wasmBallot.ciphertext.c2_hex,
        wasmBallot.range_proof
      );

      if (!isLocalProofValid) {
        throw new Error('Local client-side ZK range proof validation failed.');
      }

      // 2. Transmit Encrypted Ballot to Canister
      await castBallot({
        nullifier: wasmBallot.nullifier,
        ciphertext: wasmBallot.ciphertext,
        range_proof: wasmBallot.range_proof,
      });

      // 3. Set Receipt (Zero plaintext information is retained)
      const nullifierHex = Array.from(wasmBallot.nullifier)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      setReceipt({
        nullifierHex,
        c1Hex: wasmBallot.ciphertext.c1_hex,
        c2Hex: wasmBallot.ciphertext.c2_hex,
        rangeProofValid: isLocalProofValid,
      });

      // Clear voter secret from state
      setVoterSecret('');
      setSelectedVote(null);
    } catch (err: any) {
      console.error('Failed to cast ballot:', err);
      setErrorMessage(err?.message || 'Error casting ballot');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="card-title">Voter Portal</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Cast your zero-knowledge encrypted ballot directly from your browser.
            </p>
          </div>
          <PhaseBadge phase={phase} />
        </div>

        {!auth.isAuthenticated ? (
          <div className="alert alert-info">
            <Lock size={18} />
            <span>Connect your Internet Identity above to verify your voter registration.</span>
          </div>
        ) : isRegistered === false ? (
          <div className="alert alert-danger">
            <AlertTriangle size={18} />
            <span>
              Your Principal (<code>{auth.principalText}</code>) is not registered in the election voter list.
            </span>
          </div>
        ) : isRegistered === true ? (
          <div className="alert alert-success">
            <CheckCircle2 size={18} />
            <span>
              Eligible Voter: Your Principal is registered and authorized to cast one ballot.
            </span>
          </div>
        ) : null}

        {errorMessage && (
          <div className="alert alert-danger">
            <AlertTriangle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {receipt ? (
        <div className="card" style={{ border: '1px solid var(--success-border)' }}>
          <div className="card-title" style={{ color: '#10b981' }}>
            <FileText size={22} /> Cryptographic Ballot Receipt
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Your ballot has been homomorphically aggregated on-chain. Store this receipt to verify your vote inclusion.
          </p>

          <div className="receipt-card">
            <div className="receipt-row">
              <span className="receipt-key">Nullifier Hash (Double-Vote Guard):</span>
              <span className="receipt-val">0x{receipt.nullifierHex}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-key">Encrypted Ciphertext C1:</span>
              <span className="receipt-val">{receipt.c1Hex}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-key">Encrypted Ciphertext C2:</span>
              <span className="receipt-val">{receipt.c2Hex}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-key">1-out-of-2 ZK Range Proof:</span>
              <span className="receipt-val" style={{ color: '#10b981' }}>Verified Valid</span>
            </div>
          </div>

          <button className="btn btn-secondary" onClick={() => setReceipt(null)}>
            Cast Another / Return
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="card-title">
            <Vote size={20} /> Encrypted Ballot Submission
          </div>

          <form onSubmit={handleCastBallot} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label">Select Your Vote Option</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="button"
                  className={`btn ${selectedVote === 1 ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '1rem' }}
                  onClick={() => setSelectedVote(1)}
                  disabled={!isVotingOpen || !auth.isAuthenticated || isSubmitting}
                >
                  YES (1)
                </button>
                <button
                  type="button"
                  className={`btn ${selectedVote === 0 ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '1rem' }}
                  onClick={() => setSelectedVote(0)}
                  disabled={!isVotingOpen || !auth.isAuthenticated || isSubmitting}
                >
                  NO (0)
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Voter Secret Passphrase (for unique Nullifier derivation)</label>
              <input
                type="password"
                className="form-input"
                placeholder="Enter secret passphrase (kept only in browser memory)"
                value={voterSecret}
                onChange={(e) => setVoterSecret(e.target.value)}
                disabled={!isVotingOpen || !auth.isAuthenticated || isSubmitting}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Derives <code>Keccak256(secret || election_id)</code> to prevent double-voting without linking identity.
              </span>
            </div>

            <div className="alert alert-info" style={{ fontSize: '0.8rem' }}>
              <ShieldCheck size={16} />
              <span>
                Zero-Knowledge Guarantee: Your vote is encrypted in WebAssembly with a 1-out-of-2 Disjunctive Chaum-Pedersen proof. The plain value never touches network requests.
              </span>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={!isVotingOpen || !auth.isAuthenticated || isRegistered === false || selectedVote === null || isSubmitting}
              style={{ padding: '0.9rem' }}
            >
              {isSubmitting ? 'Generating ZK Proof & Casting...' : 'Encrypt & Cast Ballot'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
